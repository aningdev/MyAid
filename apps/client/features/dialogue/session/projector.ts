/**
 * Project the official Session event window onto Dialogue `Msg` values.
 * The window is the official model's contiguous logical history
 * (`SessionEventLikeEntry[]`); this module keeps no history of its own, it
 * folds each published delta and reads the events dsh-bot draws.
 * Only human-sourced `user/message` events become user bubbles.
 */
import type {
  SessionEventChange,
  SessionEventLikeEntry,
  SessionEventWindow,
} from "@dsh-bot/dsh-web-protocol/client";

import { t } from "../../../lib/i18n";
import type { Msg, Status, Tool } from "../chat/scripts";

type Event = {
  seq: number;
  type: string;
  /** When dsh recorded it (epoch ms). */
  time?: number;
  data: Record<string, unknown>;
  surfaceOp?: unknown;
};

type GenericTool = Extract<Tool, { kind: "generic" }>;

type LiveChunk = {
  attemptId: string;
  chunk: unknown;
};

type ParsedContent = {
  text: string;
  reasoning: string;
  tools: GenericTool[];
};

type LiveAcc = {
  text: string;
  reason: string;
  tools: Map<string, GenericTool>;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function textBlocks(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const block = object(item);
      return block.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .join("");
}

function parseContent(value: unknown): ParsedContent {
  if (typeof value === "string") return { text: value, reasoning: "", tools: [] };
  if (!Array.isArray(value)) return { text: "", reasoning: "", tools: [] };
  let text = "";
  let reasoning = "";
  const tools: GenericTool[] = [];
  for (const item of value) {
    const block = object(item);
    if (block.type === "text" && typeof block.text === "string") text += block.text;
    else if (block.type === "reasoning" && typeof block.text === "string") reasoning += block.text;
    else if (block.type === "tool-call" && typeof block.id === "string") {
      tools.push({
        id: block.id,
        kind: "generic",
        state: "pending",
        name: typeof block.name === "string" ? block.name : "tool",
        arguments: typeof block.arguments === "string" ? block.arguments : "",
      });
    }
  }
  return { text, reasoning, tools };
}

/** Fold one stream chunk (the official compact Assistant stream) into the live reply. */
function applyStreamChunk(chunk: Record<string, unknown>, into: LiveAcc): void {
  if (chunk.type === "text-delta" && typeof chunk.text === "string") {
    into.text += chunk.text;
    return;
  }
  if (chunk.type === "reasoning-delta" && typeof chunk.text === "string") {
    into.reason += chunk.text;
    return;
  }
  if (chunk.type === "tool-call-delta" && typeof chunk.id === "string") {
    const prev = into.tools.get(chunk.id);
    into.tools.set(chunk.id, {
      id: chunk.id,
      kind: "generic",
      state: prev?.state ?? "pending",
      name: typeof chunk.name === "string" ? chunk.name : (prev?.name ?? "tool"),
      arguments:
        (prev?.arguments ?? "") +
        (typeof chunk.argumentsDelta === "string" ? chunk.argumentsDelta : ""),
      result: prev?.result,
      isError: prev?.isError,
    });
    return;
  }
  if (chunk.type !== "block-end") return;
  const block = object(chunk.block);
  if (block.type === "tool-call" && typeof block.id === "string") {
    const prev = into.tools.get(block.id);
    into.tools.set(block.id, {
      id: block.id,
      kind: "generic",
      state: prev?.state === "done" ? "done" : "pending",
      name: typeof block.name === "string" ? block.name : (prev?.name ?? "tool"),
      arguments: typeof block.arguments === "string" ? block.arguments : (prev?.arguments ?? ""),
      result: prev?.result,
      isError: prev?.isError,
    });
  } else if (block.type === "reasoning" && typeof block.text === "string" && !into.reason) {
    into.reason = block.text;
  } else if (block.type === "text" && typeof block.text === "string" && !into.text) {
    into.text = block.text;
  }
}

function fromUser(data: Record<string, unknown>): boolean {
  const source = object(data.source);
  return typeof source.kind === "string" ? source.kind === "user" : true;
}

function withResult(tool: GenericTool, result: GenericTool | undefined): GenericTool {
  if (!result) return tool;
  return {
    ...tool,
    state: result.state,
    result: result.result,
    isError: result.isError,
  };
}

/** Why a turn ended, as data: the view words it, so a switch rewords it. */
export type TurnOutcome =
  | { kind: "interrupted" }
  | { kind: "stopped" }
  | { kind: "failed"; error: string | null }
  | null;

/** A turn's outcome as the assistant message's status. */
export function outcomeStatus(outcome: TurnOutcome): Status {
  if (!outcome) return "done";
  return outcome.kind === "stopped" ? "stopped" : "error";
}

/** A turn's outcome as the sentence a message or snapshot shows. */
export function outcomeText(outcome: TurnOutcome): string {
  if (!outcome) return "";
  if (outcome.kind === "interrupted") return t("session.status.interrupted");
  if (outcome.kind === "stopped") return t("session.status.stopped");
  return outcome.error
    ? t("session.status.failed", { error: outcome.error })
    : t("session.status.failedHint");
}

export type ProjectedChat = {
  messages: Msg[];
  outcome: TurnOutcome;
  liveMd: string;
  liveReason: string;
  liveTools: Tool[];
  /** The window does not reach the first event: older pages can be read. */
  olderHasMore: boolean;
  /** Files the turn declared with dsh's `present` tool, newest last. */
  deliverables: Deliverable[];
};

/** One file a Session's turn declared as a deliverable (`deliverables/presented`). */
export type Deliverable = {
  path: string;
  description?: string;
};

/**
 * Fold of the official Session event window. Deltas are applied when they
 * arrive in order; anything else (a replaced window after reconnect) is
 * rebuilt from the window the official model published.
 */
export class SessionProjector {
  private events: Event[] = [];
  private live = "";
  private liveReasonText = "";
  private liveToolMap = new Map<string, GenericTool>();
  /** Results keyed by toolCallId, applied when building history + live. */
  private toolResults = new Map<string, GenericTool>();
  /** Prompt request ids the log has admitted (`user/message` source `rpcId`). */
  private rpcIds = new Set<string>();
  private attempt: string | undefined;
  private revision = -1;
  /** Built messages and deliverables, dropped when a durable event lands. */
  private durable: { messages: Msg[]; deliverables: Deliverable[] } | null = null;
  outcome: TurnOutcome = null;
  /** The snapshot cut off older events (`hasMore` on the window). */
  hasMore = false;

  /** Apply the official window; a non-contiguous revision rebuilds from scratch. */
  apply(window: SessionEventWindow): void {
    if (window.revision === this.revision) return;
    if (window.revision === this.revision + 1) this.delta(window.change);
    else this.rebuild(window.entries);
    this.revision = window.revision;
    this.hasMore = window.hasMore;
  }

  /** The newest durable event seq held, or `null` for an empty window. */
  lastSeq(): number | null {
    let last: number | null = null;
    for (const event of this.events) {
      if (last === null || event.seq > last) last = event.seq;
    }
    return last;
  }

  /** Whether the log admitted a prompt this Client sent (durable `rpcId`). */
  admitted(requestId: string): boolean {
    return this.rpcIds.has(requestId);
  }

  /** Whether a `turn/start` newer than `seq` is in the window. */
  turnStartedAfter(seq: number | null): boolean {
    return this.events.some((event) => event.type === "turn/start" && event.seq > (seq ?? 0));
  }

  /**
   * The folded view. Live chunks only touch the live reply, so the durable
   * transcript is built once per durable event — a long reply streams without
   * re-walking its own history at every token.
   */
  snapshot(): ProjectedChat {
    const durable = (this.durable ??= this.buildDurable());
    const liveTools = [...this.liveToolMap.values()].map((tool) =>
      withResult(tool, this.toolResults.get(tool.id)),
    );
    return {
      messages: durable.messages,
      outcome: this.outcome,
      liveMd: this.live,
      liveReason: this.liveReasonText,
      liveTools,
      olderHasMore: this.hasMore,
      deliverables: durable.deliverables,
    };
  }

  /** Build the durable transcript and its deliverables from the window. */
  private buildDurable(): { messages: Msg[]; deliverables: Deliverable[] } {
    const messages: Msg[] = [];
    for (const event of this.events) {
      if (event.type === "user/message" && fromUser(event.data)) {
        messages.push({
          kind: "user",
          id: `u${event.seq}`,
          ...(typeof event.time === "number" ? { at: event.time } : {}),
          text: textBlocks(event.data.content),
        });
      }
      if (event.type === "assistant/message") {
        const parsed = parseContent(object(event.data.message).content);
        const tools = parsed.tools.map((tool) => withResult(tool, this.toolResults.get(tool.id)));
        const status = outcomeStatus(this.outcome);
        messages.push({
          kind: "assistant",
          id: `a${event.seq}`,
          ...(typeof event.time === "number" ? { at: event.time } : {}),
          model: "Deep",
          script: "dsh",
          reasoning: parsed.reasoning
            ? { text: parsed.reasoning, seconds: 1, open: false }
            : undefined,
          tools,
          md: parsed.text,
          status,
          error: status === "error" ? outcomeText(this.outcome) || undefined : undefined,
        });
      }
    }

    return {
      messages: messages.filter(
        (m) =>
          (m.kind === "user" && m.text.length > 0) ||
          (m.kind === "assistant" && (m.md.length > 0 || m.tools.length > 0 || !!m.reasoning)),
      ),
      deliverables: this.deliverables(),
    };
  }

  /**
   * Deliverables in the loaded window, in the order their turns declared them.
   * One row per path: a later declaration of the same file updates its note.
   */
  private deliverables(): Deliverable[] {
    const byPath = new Map<string, Deliverable>();
    for (const event of this.events) {
      if (event.type !== "deliverables/presented") continue;
      if (!Array.isArray(event.data.files)) continue;
      for (const item of event.data.files) {
        const file = object(item);
        const path = typeof file.path === "string" ? file.path.trim() : "";
        if (!path) continue;
        byPath.set(path, {
          path,
          ...(typeof file.description === "string" && file.description
            ? { description: file.description }
            : {}),
        });
      }
    }
    return [...byPath.values()];
  }

  private delta(change: SessionEventChange): void {
    switch (change.kind) {
      case "replace":
        this.rebuild(change.entries);
        return;
      case "prepend":
        this.prepend(change.entries);
        return;
      case "append":
        for (const entry of change.entries) this.entry(entry);
        return;
      case "settle-assistant":
        if (this.attempt === change.attemptId) this.resetLive();
        // The settlement's durable event replaces the transient rows.
        if (change.entry) this.entry(change.entry);
        return;
    }
  }

  private rebuild(entries: readonly SessionEventLikeEntry[]): void {
    this.events = [];
    this.durable = null;
    this.outcome = null;
    this.toolResults.clear();
    this.rpcIds.clear();
    this.resetLive();
    for (const entry of entries) this.entry(entry);
  }

  /** One older page lands above the window, never moving what the list shows. */
  private prepend(entries: readonly SessionEventLikeEntry[]): void {
    const held = new Set(this.events.map((event) => event.seq));
    const older: Event[] = [];
    for (const entry of entries) {
      if (entry.type !== "event") continue;
      const event = this.wireEvent(entry.event);
      if (!event || held.has(event.seq)) continue;
      older.push(event);
    }
    this.events = [...older, ...this.events].sort((left, right) => left.seq - right.seq);
    this.durable = null;
  }

  private entry(entry: SessionEventLikeEntry): void {
    if (entry.type === "transient") {
      this.liveChunk(entry.event as unknown as LiveChunk & { attemptId?: string });
      return;
    }
    this.event(entry.event);
  }

  /** One client-only Assistant chunk, ordered between durable events. */
  private liveChunk(entry: { data?: unknown } & Partial<LiveChunk>): void {
    const data = object(entry.data ?? entry);
    const attemptId = typeof data.attemptId === "string" ? data.attemptId : "";
    if (!attemptId) return;
    if (attemptId !== this.attempt) {
      // A new attempt supersedes the previous live reply; keep its id after
      // the reset so the rest of this attempt's chunks keep accumulating.
      this.resetLive();
      this.attempt = attemptId;
    }
    const live: LiveAcc = {
      text: this.live,
      reason: this.liveReasonText,
      tools: this.liveToolMap,
    };
    applyStreamChunk(object(data.chunk), live);
    this.live = live.text;
    this.liveReasonText = live.reason;
  }

  private resetLive(): void {
    this.live = "";
    this.liveReasonText = "";
    this.liveToolMap = new Map();
    this.attempt = undefined;
  }

  private wireEvent(value: unknown): Event | null {
    const e = object(value);
    if (typeof e.seq !== "number" || typeof e.type !== "string") return null;
    return {
      seq: e.seq,
      type: e.type,
      time: typeof e.time === "number" ? e.time : undefined,
      data: object(e.data),
      surfaceOp: e.surfaceOp,
    };
  }

  private event(value: unknown): void {
    const event = this.wireEvent(value);
    if (!event) return;
    // A durable event changes what the transcript shows.
    this.durable = null;
    const op = object(event.surfaceOp);
    if (op.op === "replace" && typeof op.startSeq === "number" && typeof op.endSeq === "number") {
      const start = op.startSeq;
      const end = op.endSeq;
      this.events = this.events.filter((item) => item.seq < start || item.seq > end);
    }
    if (!this.events.some((item) => item.seq === event.seq)) this.events.push(event);

    if (event.type === "user/message") {
      const source = object(event.data.source);
      if (typeof source.rpcId === "string") this.rpcIds.add(source.rpcId);
    }
    if (event.type === "turn/start") {
      this.outcome = null;
      this.toolResults.clear();
    }
    if (event.type === "turn/end") {
      const reason = object(event.data.reason);
      this.outcome =
        reason.kind === "interrupted"
          ? { kind: "interrupted" }
          : reason.kind === "aborted"
            ? { kind: "stopped" }
            : reason.kind === "error"
              ? {
                  kind: "failed",
                  error: String(object(reason.error).message ?? t("common.unknownError")),
                }
              : null;
    }
    if (event.type === "tool/call") {
      const callId = typeof event.data.callId === "string" ? event.data.callId : "";
      if (callId) {
        const prev = this.liveToolMap.get(callId);
        this.liveToolMap.set(callId, {
          id: callId,
          kind: "generic",
          state: "running",
          name: typeof event.data.name === "string" ? event.data.name : (prev?.name ?? "tool"),
          arguments:
            typeof event.data.arguments === "string"
              ? event.data.arguments
              : (prev?.arguments ?? ""),
          result: prev?.result,
          isError: prev?.isError,
        });
      }
    }
    if (event.type === "tool/result") {
      const message = object(event.data.message);
      const callId =
        typeof message.toolCallId === "string"
          ? message.toolCallId
          : typeof object(message.source).callId === "string"
            ? String(object(message.source).callId)
            : "";
      if (callId) {
        const prev = this.liveToolMap.get(callId) ?? this.toolResults.get(callId);
        const isError = message.isError === true || event.data.error != null;
        const result: GenericTool = {
          id: callId,
          kind: "generic",
          state: "done",
          name: prev?.name ?? "tool",
          arguments: prev?.arguments ?? "",
          result: textBlocks(message.content),
          isError,
        };
        this.toolResults.set(callId, result);
        if (this.liveToolMap.has(callId)) this.liveToolMap.set(callId, result);
      }
    }
    if (event.type === "assistant/message") {
      const parsed = parseContent(object(event.data.message).content);
      // Prefer durable message text so ChatPane can still read live* if freeze races.
      if (parsed.text) this.live = parsed.text;
      if (parsed.reasoning) this.liveReasonText = parsed.reasoning;
      for (const tool of parsed.tools) {
        this.liveToolMap.set(tool.id, withResult(tool, this.toolResults.get(tool.id)));
      }
    }
    if (event.data.interrupted === true) this.outcome = { kind: "stopped" };
    if (event.type.includes("error") || event.type === "llm/failure") {
      this.outcome = { kind: "failed", error: null };
    }
  }
}
