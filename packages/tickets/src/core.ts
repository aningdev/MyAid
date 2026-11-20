/**
 * The Tickets core: the product rules, independent of dsh's service objects.
 *
 * It owns the Ticket/Attention state machine over the store, turns dsh Agent
 * events into Ticket transitions, and raises Attentions from the
 * user-questions and approval waterfalls. dsh itself is reached only through
 * {@link TicketSessions}, and Bots only through {@link TicketBots}, so the
 * whole core runs in tests against fakes.
 */
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ApprovalOutcome, ApprovalRequest } from "@deepseek-ai/dsh-user-approval";
import type {
  AskUserQuestionAnswer,
  AskUserQuestionItem,
  AskUserQuestionRequest,
} from "@deepseek-ai/dsh-user-questions";
import type { BotsRouting } from "dsh-bots";

import {
  answerAttention,
  createAttention,
  createTicket,
  endTicket,
  isLiveTicket,
  raiseTicket,
  restoreTicket,
  resumeTicketWork,
  TicketError,
  triggerSchema,
  withdrawAttention,
  type Attention,
  type AttentionAnswer,
  type AttentionQuestion,
  type SourceThread,
  type Ticket,
  type TicketEnd,
  type TicketOrigin,
  type Trigger,
} from "./domain.ts";
import {
  newAttentionId,
  newSourceThreadId,
  newTicketId,
  sessionIdFor,
  sourceSessionIdFor,
} from "./ids.ts";
import type { TicketSessions } from "./sessions.ts";
import { type SourceDelivery, type SourceRegistry, type TriggerDelivery } from "./sources.ts";
import type { TicketsStore } from "./store.ts";
import { openTicketTool, OPEN_TICKET_TOOL, reportTicketTool } from "./tool.ts";
import type { AnswerAttentionRequest, TicketsSnapshot } from "./wire.ts";

/** Where a Ticket came from: the Main Bot's Session that opened it. */
export type MainBotOrigin = { kind: "main-bot"; sessionId: string };

/** What opening a Ticket needs from its caller. */
export type OpenTicketRequest = {
  /** A ready Bot's name or id. */
  bot: string;
  title: string;
  request: string;
  workspacePath?: string;
  origin: MainBotOrigin;
};

/** The Bots plugin as this one uses it. */
export interface TicketBots {
  routing(): Promise<BotsRouting>;
  botForSession(sessionId: string): Promise<string | null>;
}

export type TicketLogger = { warn(message: string): void };

export type TicketsCoreOptions = {
  store: TicketsStore;
  bots: TicketBots;
  sessions: TicketSessions;
  /** The Sources this deployment registered; Tickets read and write through them. */
  sources: SourceRegistry;
  logger: TicketLogger;
  now?: () => number;
};

/** One Attention waiting for a person, with the way to settle its waiter. */
type PendingAttention = {
  /** Hand the person's answer back to the blocked Session. */
  answer(answer: AttentionAnswer): void;
  /** The Ticket ended or its Session left; stop waiting. */
  withdraw(reason: string): void;
};

export class TicketsCore {
  private readonly store: TicketsStore;
  private readonly bots: TicketBots;
  private readonly sessions: TicketSessions;
  private readonly sources: SourceRegistry;
  private readonly logger: TicketLogger;
  private readonly now: () => number;
  private readonly pending = new Map<string, PendingAttention>();
  private readonly toolSessions = new Set<string>();
  private readonly ready: Promise<void>;

  constructor(options: TicketsCoreOptions) {
    this.store = options.store;
    this.bots = options.bots;
    this.sessions = options.sessions;
    this.sources = options.sources;
    this.logger = options.logger;
    this.now = options.now ?? Date.now;
    this.ready = this.store.load();
    this.ready.catch(() => undefined);
  }

  /** The current snapshot, pending Attentions only. */
  async snapshot(): Promise<TicketsSnapshot> {
    await this.ready;
    const state = await this.store.snapshot();
    return { ...state, sources: this.sources.list() };
  }

  /**
   * Stream the snapshot on subscription, then again after every write.
   * @param signal - subscription lifetime; aborting ends only this stream.
   */
  async *watch(signal: AbortSignal): AsyncIterable<TicketsSnapshot> {
    await this.ready;
    let wake = Promise.withResolvers<void>();
    let dirty = true;
    const notify = (): void => {
      dirty = true;
      wake.resolve();
    };
    const unsubscribe = this.store.subscribe(notify);
    signal.addEventListener("abort", notify, { once: true });
    try {
      while (!signal.aborted) {
        if (!dirty) await wake.promise;
        if (signal.aborted) break;
        dirty = false;
        wake = Promise.withResolvers<void>();
        yield await this.snapshot();
      }
    } finally {
      unsubscribe();
      signal.removeEventListener("abort", notify);
    }
  }

  /**
   * Hand work to a Bot: create the Ticket and its Session under the Bot's
   * Agent preset, then deliver the request.
   */
  async open(input: OpenTicketRequest): Promise<Ticket> {
    await this.ready;
    const title = input.title.trim();
    const request = input.request.trim();
    if (title === "" || request === "") {
      throw new TicketError("tickets/invalid", "Ticket 需要标题和请求内容。");
    }
    const routing = await this.bots.routing();
    const target = resolveBot(routing, input.bot);
    if (target === null) {
      throw new TicketError(
        "tickets/not-found",
        `没有名为“${input.bot}”的可用 Bot。可用的 Bot：${botNames(routing)}。`,
      );
    }
    const trigger = await this.pendingTrigger(input.origin.sessionId);
    const source = trigger === null ? null : this.sources.get(trigger.source);
    // A request that came in through a Source keeps that Source as its origin,
    // so its result goes back to the same Source thread.
    const origin: TicketOrigin =
      trigger === null || source === null
        ? input.origin
        : {
            kind: "source",
            source: trigger.source,
            sourceKind: source.kind,
            triggerId: trigger.id,
            thread: trigger.thread,
            address: trigger.address,
          };
    const ticket = createTicket(
      {
        id: newTicketId(),
        botId: target.id,
        title,
        request,
        origin,
        sessionId: null,
        workspacePath: blankToNull(input.workspacePath) ?? target.workspacePath,
      },
      this.now(),
    );
    const sessionId = sessionIdFor(ticket.id);
    const started = { ...ticket, sessionId };
    await this.store.write((document) => ({
      ...document,
      tickets: [...document.tickets, started],
    }));
    if (trigger !== null && source !== null) {
      await this.reply(trigger, `已收到，正在为你处理：「${title}」。`);
    }
    try {
      await this.sessions.start({
        sessionId,
        cwd: started.workspacePath,
        agentPreset: target.presetId,
        title: started.title,
      });
      await this.sessions.prompt(sessionId, started.id, started.request);
    } catch (error) {
      const finished = await this.finish(started.id, {
        kind: "failed",
        error: `无法启动 Ticket Session：${message(error)}`,
      });
      if (finished !== null) await this.report(finished);
      throw error;
    }
    return started;
  }

  /**
   * Take one Trigger from a Source: dedupe it, decide whether it comes from
   * the Owner's identity, keep it, and — only when it does — hand it to the
   * Main Bot Session that follows that Source thread.
   */
  async deliver(sourceId: string, incoming: SourceDelivery): Promise<TriggerDelivery> {
    await this.ready;
    const source = this.sources.get(sourceId);
    if (source === null) {
      throw new TicketError("tickets/not-found", `Source“${sourceId}”没有注册。`);
    }
    if (!source.enabled) {
      throw new TicketError("tickets/invalid", `Source“${sourceId}”已停用。`);
    }
    const human =
      incoming.human == null ? null : { id: incoming.human.id, name: incoming.human.name ?? null };
    const trigger = triggerSchema.parse({
      id: incoming.id,
      source: sourceId,
      thread: incoming.thread,
      address: incoming.address,
      at: normalizeAt(incoming.at, this.now()),
      human,
      text: incoming.text,
      disposition: human !== null && human.id === source.owner ? "accepted" : "ignored",
    });
    const state = await this.store.snapshot();
    if (state.triggers.some((item) => item.source === sourceId && item.id === trigger.id)) {
      return { status: "duplicate" };
    }
    await this.store.write((document) =>
      document.triggers.some((item) => item.source === sourceId && item.id === trigger.id)
        ? document
        : { ...document, triggers: [...document.triggers, trigger] },
    );
    if (trigger.disposition === "ignored") return { status: "ignored", trigger };
    const routing = await this.bots.routing();
    const sourceThread = await this.sourceThreadFor(
      trigger,
      `${source.title.zh} · ${trigger.thread}`,
      routing.mainBot.presetId,
    );
    if (sourceThread === null) {
      throw new TicketError(
        "tickets/invalid",
        `无法为 ${trigger.source}/${trigger.thread} 打开 Main Bot Session。`,
      );
    }
    await this.sessions.trigger(
      sourceThread.sessionId,
      { triggerId: trigger.id, source: trigger.source },
      triggerPrompt(source.title.zh, trigger),
    );
    return { status: "accepted", trigger };
  }

  /**
   * Answer one pending Attention. The Ticket reopens in the same write, then
   * the blocked Session receives the answer.
   */
  async answer(input: AnswerAttentionRequest): Promise<TicketsSnapshot> {
    await this.ready;
    const snapshot = await this.store.snapshot();
    const attention = snapshot.attentions.find((item) => item.id === input.attentionId);
    if (attention === undefined) {
      throw new TicketError(
        "tickets/not-found",
        `Attention ${input.attentionId} 不存在，或者已经处理过了。`,
      );
    }
    const waiter = this.pending.get(attention.id);
    if (waiter === undefined) {
      throw new TicketError("tickets/invalid", `Attention ${attention.id} 已不在等待。`);
    }
    const answer = normalizeAnswer(attention, input.answer);
    await this.store.write((document) => {
      const target = mustTicket(document, attention.ticketId);
      return {
        ...document,
        attentions: document.attentions.map((item) =>
          item.id === attention.id ? answerAttention(item, answer, this.now()) : item,
        ),
        tickets: document.tickets.map((item) =>
          item.id === target.id ? resumeTicketWork(target, this.now()) : item,
        ),
      };
    });
    this.pending.delete(attention.id);
    waiter.answer(answer);
    return this.snapshot();
  }

  /**
   * Cancel a live Ticket as its Owner: withdraw what it waits on, stop its
   * Session, and tell the Main Bot.
   */
  async cancel(ticketId: string): Promise<TicketsSnapshot> {
    await this.ready;
    const snapshot = await this.store.snapshot();
    const ticket = snapshot.tickets.find((item) => item.id === ticketId);
    if (ticket === undefined) {
      throw new TicketError("tickets/not-found", `Ticket ${ticketId} 不存在。`);
    }
    if (!isLiveTicket(ticket)) {
      throw new TicketError(
        "tickets/invalid",
        `Ticket ${ticketId} 当前是 ${ticket.status}，不能取消。`,
      );
    }
    const pending = snapshot.attentions.filter((item) => item.ticketId === ticketId);
    const written = await this.settleTicket(ticketId, { kind: "cancelled" }, pending);
    for (const attention of pending) {
      this.settleAsWithdrawn(attention.id, "Ticket 被 Owner 取消。");
    }
    if (ticket.sessionId !== null) {
      try {
        await this.sessions.cancel(ticket.sessionId);
      } catch (error) {
        this.logger.warn(`tickets: could not stop Session ${ticket.sessionId}: ${String(error)}`);
      }
    }
    await this.report(written);
    return this.snapshot();
  }

  /**
   * A Session's turn ended. A Ticket Session ends no Ticket by itself (its
   * Bot reports explicitly); a Main Bot Session that answered a Source
   * Trigger without opening a Ticket writes that answer back once.
   */
  async agentStatus(agent: Agent, status: "running" | "idle"): Promise<void> {
    if (status !== "idle") return;
    await this.ready;
    const sessionId = String(agent.id);
    if ((await this.directTicket(sessionId)) !== null) return;
    const trigger = await this.pendingTrigger(sessionId);
    if (trigger === null) return;
    await this.reply(
      trigger,
      lastAssistantText(agent) ?? "Main Bot 结束了这一轮，但没有写出回答。",
    );
  }

  /** A Ticket Session's Bot reported its outcome through `ticket_report`. */
  async reportWork(
    sessionId: string,
    input: { status: "completed" | "failed"; result: string },
  ): Promise<Ticket> {
    await this.ready;
    const ticket = await this.directTicket(sessionId);
    if (ticket === null) {
      throw new TicketError("tickets/not-found", "只有 Ticket Session 能报告结果。");
    }
    if (!isLiveTicket(ticket)) {
      throw new TicketError("tickets/invalid", `Ticket ${ticket.id} 已经结束，不能再报告。`);
    }
    if (ticket.status === "waiting") {
      throw new TicketError(
        "tickets/invalid",
        `Ticket ${ticket.id} 正在等 Owner 回答，回答之后这一轮继续。`,
      );
    }
    const end: TicketEnd =
      input.status === "completed"
        ? { kind: "completed", result: input.result }
        : { kind: "failed", error: input.result };
    const finished = await this.finish(ticket.id, end);
    if (finished === null) {
      throw new TicketError("tickets/invalid", `Ticket ${ticket.id} 刚刚被改过，无法报告。`);
    }
    await this.report(finished);
    return finished;
  }

  /** The Ticket Session failed: end the Ticket as failed. */
  async agentError(agent: Agent, error: unknown): Promise<void> {
    await this.ready;
    const ticket = await this.directTicket(String(agent.id));
    if (ticket === null || !isLiveTicket(ticket)) return;
    const finished = await this.finish(ticket.id, {
      kind: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    if (finished !== null) await this.report(finished);
  }

  /** A disposed Session can no longer answer what it was waiting on. */
  async agentDisposed(agent: Agent): Promise<void> {
    await this.ready;
    const sessionId = String(agent.id);
    this.toolSessions.delete(sessionId);
    const ticket = await this.directTicket(sessionId);
    if (ticket === null) return;
    await this.withdrawForTicket(ticket.id, "Ticket Session 已结束。");
  }

  /**
   * The Owner wrote in a Ticket Session. A finished Ticket comes back to life:
   * the message is new work, not the end of the old turn.
   */
  async ownerMessage(sessionId: string): Promise<void> {
    await this.ready;
    const ticket = await this.directTicket(sessionId);
    if (ticket === null) return;
    if (ticket.status !== "completed" && ticket.status !== "failed") return;
    await this.store.write((document) => ({
      ...document,
      tickets: document.tickets.map((item) =>
        item.id === ticket.id ? restoreTicket(item, this.now()) : item,
      ),
    }));
  }

  /**
   * Ask the Owner a question from a Ticket Session. The Attention is the
   * question; the caller stays blocked until a device answers.
   */
  async askQuestion(
    ticketId: string,
    request: AskUserQuestionRequest,
  ): Promise<AskUserQuestionAnswer> {
    await this.ready;
    const questions = request.questions.map(flattenQuestion);
    const gate = Promise.withResolvers<AskUserQuestionAnswer>();
    const attention = createAttention(
      {
        id: newAttentionId(),
        ticketId,
        kind: "question",
        prompt: promptFor(questions),
        questions,
        approval: null,
      },
      this.now(),
    );
    await this.raise(attention);
    this.pending.set(attention.id, {
      answer: (answer) => {
        if (answer.kind !== "question") return;
        gate.resolve({
          answers: answer.answers.map((item) => ({
            id: item.questionId,
            selected: item.selected,
            ...(item.custom === undefined ? {} : { custom: item.custom }),
          })),
        });
      },
      withdraw: (reason) => {
        gate.reject(new Error(reason));
      },
    });
    return this.awaitAttention(attention.id, request.signal, gate.promise);
  }

  /** Ask the Owner to review one tool call from a Ticket Session. */
  async askApproval(ticketId: string, request: ApprovalRequest): Promise<ApprovalOutcome> {
    await this.ready;
    const toolName = request.toolName;
    const reason = request.reason ?? request.displayReason?.zh ?? request.displayReason?.en ?? null;
    const gate = Promise.withResolvers<ApprovalOutcome>();
    const attention = createAttention(
      {
        id: newAttentionId(),
        ticketId,
        kind: "approval",
        prompt:
          reason === null ? `允许 ${toolName} 执行吗？` : `允许 ${toolName} 执行吗？\n\n${reason}`,
        questions: [],
        approval: { toolName, reason },
      },
      this.now(),
    );
    await this.raise(attention);
    this.pending.set(attention.id, {
      answer: (answer) => {
        gate.resolve(
          answer.kind === "approval" && answer.decision === "allow" ? "allowed-once" : "rejected",
        );
      },
      withdraw: () => {
        gate.resolve("cancelled");
      },
    });
    return this.awaitAttention(attention.id, request.signal, gate.promise);
  }

  /**
   * Register the Ticket-opening tool on the Main Bot's Agent. Called on every
   * Agent creation; other Bots never see it.
   */
  async attachMainBotTool(agent: Agent): Promise<boolean> {
    await this.ready;
    const key = String(agent.id);
    if (this.toolSessions.has(key)) return true;
    const routing = await this.bots.routing();
    const owner = await this.bots.botForSession(key);
    const isMainBot =
      owner === routing.mainBot.id || agent.session.header.agentPreset === routing.mainBot.presetId;
    if (!isMainBot) return false;
    agent.ctx.tools.register(toolFor(this, agent, routing));
    this.toolSessions.add(key);
    return true;
  }

  /**
   * Register the reporting tool on a Ticket's own Session. Called on every
   * Agent creation; only a Ticket Session sees it.
   */
  async attachTicketTool(agent: Agent): Promise<boolean> {
    await this.ready;
    const ticket = await this.directTicket(String(agent.id));
    if (ticket === null) return false;
    agent.ctx.tools.register(reportTicketTool(this, agent));
    return true;
  }

  /** The tool's name, exported for prompts and tests. */
  static readonly toolName = OPEN_TICKET_TOOL;

  private async awaitAttention<T>(
    attentionId: string,
    signal: AbortSignal | undefined,
    result: Promise<T>,
  ): Promise<T> {
    if (signal === undefined) return result;
    if (signal.aborted) {
      await this.abandon(attentionId, abortReason(signal).message);
      throw abortReason(signal);
    }
    const onAbort = (): void => {
      void this.abandon(attentionId, abortReason(signal).message).catch((error: unknown) => {
        this.logger.warn(`tickets: could not withdraw Attention ${attentionId}: ${String(error)}`);
      });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      return await result;
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  /** Write a new pending Attention and put its Ticket in `waiting`. */
  private async raise(attention: Attention): Promise<void> {
    await this.store.write((document) => {
      const ticket = mustTicket(document, attention.ticketId);
      return {
        ...document,
        attentions: [...document.attentions, attention],
        tickets: document.tickets.map((item) =>
          item.id === ticket.id ? raiseTicket(ticket, this.now()) : item,
        ),
      };
    });
  }

  /** A waiter went away: withdraw its Attention and reopen the Ticket. */
  private async abandon(attentionId: string, reason: string): Promise<void> {
    if (!this.pending.has(attentionId)) return;
    const snapshot = await this.store.snapshot();
    const attention = snapshot.attentions.find((item) => item.id === attentionId);
    if (attention === undefined) {
      this.settleAsWithdrawn(attentionId, reason);
      return;
    }
    await this.store.write((document) => {
      const ticket = mustTicket(document, attention.ticketId);
      return {
        ...document,
        attentions: document.attentions.map((item) =>
          item.id === attention.id ? withdrawAttention(item, this.now()) : item,
        ),
        tickets: document.tickets.map((item) =>
          item.id === ticket.id && item.status === "waiting"
            ? resumeTicketWork(item, this.now())
            : item,
        ),
      };
    });
    this.settleAsWithdrawn(attention.id, reason);
  }

  /** Withdraw every pending Attention of one Ticket and reopen it. */
  private async withdrawForTicket(ticketId: string, reason: string): Promise<void> {
    const snapshot = await this.store.snapshot();
    const pending = snapshot.attentions.filter((item) => item.ticketId === ticketId);
    if (pending.length === 0) return;
    const ids = new Set(pending.map((item) => item.id));
    await this.store.write((document) => {
      const ticket = mustTicket(document, ticketId);
      return {
        ...document,
        attentions: document.attentions.map((item) =>
          ids.has(item.id) ? withdrawAttention(item, this.now()) : item,
        ),
        tickets: document.tickets.map((item) =>
          item.id === ticket.id && item.status === "waiting"
            ? resumeTicketWork(item, this.now())
            : item,
        ),
      };
    });
    for (const id of ids) this.settleAsWithdrawn(id, reason);
  }

  private settleAsWithdrawn(attentionId: string, reason: string): void {
    const waiter = this.pending.get(attentionId);
    if (waiter === undefined) return;
    this.pending.delete(attentionId);
    waiter.withdraw(reason);
  }

  /** End a live Ticket and withdraw anything it was waiting on. */
  private async settleTicket(
    ticketId: string,
    end: TicketEnd,
    pending: Attention[],
  ): Promise<Ticket> {
    const ids = new Set(pending.map((item) => item.id));
    let finished: Ticket | undefined;
    await this.store.write((document) => {
      const ticket = mustTicket(document, ticketId);
      if (!isLiveTicket(ticket)) return document;
      finished = endTicket(ticket, end, this.now());
      return {
        ...document,
        attentions: document.attentions.map((item) =>
          ids.has(item.id) ? withdrawAttention(item, this.now()) : item,
        ),
        tickets: document.tickets.map((item) => (item.id === ticket.id ? finished! : item)),
      };
    });
    return finished ?? mustTicket(await this.store.snapshot(), ticketId);
  }

  /** End a live, not-waiting Ticket; null when it changed underneath us. */
  private async finish(ticketId: string, end: TicketEnd): Promise<Ticket | null> {
    const snapshot = await this.store.snapshot();
    const pending = snapshot.attentions.filter((item) => item.ticketId === ticketId);
    const ticket = snapshot.tickets.find((item) => item.id === ticketId);
    if (ticket === undefined || !isLiveTicket(ticket) || ticket.status === "waiting") return null;
    return this.settleTicket(ticketId, end, pending);
  }

  /**
   * The Ticket a Session belongs to, or null. A sub-agent Session belongs to
   * the Ticket of the Session that started it, so its questions and approvals
   * still wait on the Owner.
   */
  async ticketFor(sessionId: string): Promise<Ticket | null> {
    await this.ready;
    let current: string | null = sessionId;
    const seen = new Set<string>();
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      const ticket = await this.directTicket(current);
      if (ticket !== null) return ticket;
      current = await this.sessions.parentSession(current);
    }
    return null;
  }

  /** The Ticket whose own Session this is, or null. */
  private async directTicket(sessionId: string): Promise<Ticket | null> {
    const snapshot = await this.store.snapshot();
    return snapshot.tickets.find((ticket) => ticket.sessionId === sessionId) ?? null;
  }

  /**
   * The newest accepted Trigger of one Main Bot Session that has neither been
   * replied to nor become a Ticket, or null.
   */
  private async pendingTrigger(sessionId: string): Promise<Trigger | null> {
    const state = await this.store.snapshot();
    const sourceThread = state.sourceThreads.find((item) => item.sessionId === sessionId);
    if (sourceThread === undefined) return null;
    const answered = new Set(state.answers.map((answer) => answer.triggerId));
    const linked = new Set(
      state.tickets.flatMap((ticket) =>
        ticket.origin.kind === "source" ? [ticket.origin.triggerId] : [],
      ),
    );
    return (
      state.triggers
        .filter(
          (trigger) =>
            trigger.source === sourceThread.source &&
            trigger.thread === sourceThread.thread &&
            trigger.disposition === "accepted" &&
            !answered.has(trigger.id) &&
            !linked.has(trigger.id),
        )
        .at(0) ?? null
    );
  }

  /** Find or create, and start, the Main Bot Session that follows one Source thread. */
  private async sourceThreadFor(
    trigger: Trigger,
    title: string,
    agentPreset: string,
  ): Promise<SourceThread | null> {
    const state = await this.store.snapshot();
    const existing = state.sourceThreads.find(
      (item) => item.source === trigger.source && item.thread === trigger.thread,
    );
    if (existing !== undefined) return existing;
    const sourceThread: SourceThread = {
      id: newSourceThreadId(),
      source: trigger.source,
      thread: trigger.thread,
      sessionId: "",
      createdAt: this.now(),
    };
    sourceThread.sessionId = sourceSessionIdFor(sourceThread.id);
    let created = false;
    await this.store.write((document) => {
      if (
        document.sourceThreads.some(
          (item) => item.source === trigger.source && item.thread === trigger.thread,
        )
      ) {
        return document;
      }
      created = true;
      return { ...document, sourceThreads: [...document.sourceThreads, sourceThread] };
    });
    const written =
      (await this.store.snapshot()).sourceThreads.find((item) => item.id === sourceThread.id) ??
      sourceThread;
    if (!created) return written;
    try {
      await this.sessions.start({
        sessionId: written.sessionId,
        cwd: null,
        agentPreset,
        title,
      });
    } catch (error) {
      // Do not keep a Source thread no Session follows; the next Trigger retries.
      this.logger.warn(`tickets: could not start Session ${written.sessionId}: ${String(error)}`);
      await this.store.write((document) => ({
        ...document,
        sourceThreads: document.sourceThreads.filter((item) => item.id !== written.id),
      }));
      return null;
    }
    return written;
  }

  /**
   * Write one reply into the Trigger's own Source thread and remember that this
   * Trigger has had its reply, so a later turn does not send it twice.
   */
  private async reply(trigger: Trigger, text: string): Promise<void> {
    await this.sendReply(trigger.source, trigger.id, trigger.thread, trigger.address, text);
  }

  private async sendReply(
    source: string,
    triggerId: string,
    thread: string,
    address: string,
    text: string,
  ): Promise<void> {
    try {
      await this.sources.send(source, { thread, address, text });
    } catch (error) {
      this.logger.warn(`tickets: could not reply on ${source}/${thread}: ${String(error)}`);
      return;
    }
    await this.store.write((document) =>
      document.answers.some((answer) => answer.triggerId === triggerId)
        ? document
        : { ...document, answers: [...document.answers, { triggerId, at: this.now() }] },
    );
  }

  /** Tell whoever asked what became of the Ticket. */
  private async report(ticket: Ticket): Promise<void> {
    const text = reportText(ticket);
    if (ticket.origin.kind === "source") {
      await this.sendReply(
        ticket.origin.source,
        ticket.origin.triggerId,
        ticket.origin.thread,
        ticket.origin.address,
        text,
      );
      return;
    }
    try {
      await this.sessions.notify(ticket.origin.sessionId, ticket.id, text);
    } catch (error) {
      this.logger.warn(
        `tickets: could not report ${ticket.id} to Session ${ticket.origin.sessionId}: ${String(error)}`,
      );
    }
  }
}

function toolFor(core: TicketsCore, agent: Agent, routing: BotsRouting): ToolDefinition {
  return openTicketTool(core, agent, routing);
}

function resolveBot(routing: BotsRouting, reference: string) {
  const wanted = reference.trim().toLowerCase();
  return (
    routing.bots.find((bot) => bot.id === reference.trim()) ??
    routing.bots.find((bot) => bot.name.toLowerCase() === wanted) ??
    null
  );
}

function botNames(routing: BotsRouting): string {
  return routing.bots.map((bot) => bot.name).join("、");
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function mustTicket(document: { tickets: Ticket[] }, ticketId: string): Ticket {
  const ticket = document.tickets.find((item) => item.id === ticketId);
  if (ticket === undefined) {
    throw new TicketError("tickets/not-found", `Ticket ${ticketId} 不存在。`);
  }
  return ticket;
}

function flattenQuestion(question: AskUserQuestionItem): AttentionQuestion {
  return {
    id: question.id,
    question: question.question,
    header: question.header ?? null,
    options:
      question.options?.map((option) => ({
        label: option.label,
        description: option.description ?? null,
      })) ?? null,
    multiSelect: question.multiSelect === true,
    intent: question.intent?.kind ?? null,
  };
}

function promptFor(questions: AttentionQuestion[]): string {
  return questions.map((question) => question.question).join("\n\n");
}

/** Check the person answered exactly these questions, once each. */
function normalizeAnswer(attention: Attention, answer: AttentionAnswer): AttentionAnswer {
  if (answer.kind !== attention.kind) {
    throw new TicketError(
      "tickets/invalid",
      `Attention ${attention.id} 是 ${attention.kind}，不能用 ${answer.kind} 回答。`,
    );
  }
  if (answer.kind === "approval") return answer;
  const expected = new Set(attention.questions.map((question) => question.id));
  const seen = new Set<string>();
  for (const item of answer.answers) {
    if (!expected.has(item.questionId)) {
      throw new TicketError("tickets/invalid", `问题 ${item.questionId} 不属于这个 Attention。`);
    }
    if (seen.has(item.questionId)) {
      throw new TicketError("tickets/invalid", `问题 ${item.questionId} 回答了两遍。`);
    }
    seen.add(item.questionId);
  }
  if (seen.size !== expected.size) {
    throw new TicketError("tickets/invalid", "每个问题都要回答一次。");
  }
  return {
    kind: "question",
    answers: answer.answers.map((item) => ({
      questionId: item.questionId,
      selected: item.selected,
      ...(item.custom === undefined || item.custom.trim() === ""
        ? {}
        : { custom: item.custom.trim() }),
    })),
  };
}

function normalizeAt(value: string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TicketError("tickets/invalid", "Trigger 的时间不合法。");
    return value;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed))
    throw new TicketError("tickets/invalid", `Trigger 的时间“${value}”无法解析。`);
  return parsed;
}

function triggerPrompt(sourceTitle: string, trigger: Trigger): string {
  const who = trigger.human === null ? "某人" : (trigger.human.name ?? trigger.human.id);
  return `来自 ${sourceTitle} 的 ${who}：\n\n${trigger.text}`;
}

function lastAssistantText(agent: Agent): string | null {
  const last = agent.session
    .snapshotEvents()
    .filter((event) => event.type === "assistant/message")
    .at(-1);
  if (last?.type !== "assistant/message") return null;
  const text = last.data.message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text === "" ? null : text;
}

function reportText(ticket: Ticket): string {
  const head = `Ticket ${ticket.id}（${ticket.title}）`;
  if (ticket.status === "completed") {
    return `${head} 已完成。\n\n${ticket.result ?? "Bot 没有写出结果。"}`;
  }
  if (ticket.status === "failed") {
    return `${head} 失败了。\n\n${ticket.error ?? "没有错误信息。"}`;
  }
  if (ticket.status === "cancelled") return `${head} 被 Owner 取消。`;
  return `${head} 当前是 ${ticket.status}。`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("Ticket Attention 已撤回。");
}
