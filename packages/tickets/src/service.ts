/**
 * The `tickets` Remote: Tickets the Main Bot handed to a Bot, and the
 * Attentions they wait on.
 *
 * This service owns the Tickets file. Devices read `snapshot` and follow
 * `watch`; answering an Attention and cancelling a Ticket are the two writes.
 * The state machine and the dsh wiring live in `./core.ts`.
 */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-session";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

import { TicketsCore } from "./core.ts";
import { DshTicketSessions } from "./sessions.ts";
import type { Sources } from "./sources.ts";
import { TicketsStore } from "./store.ts";
import type { AnswerAttentionRequest, TicketsSnapshot } from "./wire.ts";

declare module "@deepseek-ai/cordis" {
  interface Context {
    tickets: TicketsService;
  }
}

export type TicketsServiceOptions = {
  /** This plugin's Tickets file. */
  file: string;
  /** The `sources` service Source plugins register through. */
  sources: Sources;
};

export class TicketsService extends TypertRemoteService {
  static inject = ["bots", "sessionController"];

  private readonly core: TicketsCore;

  constructor(ctx: Context, options: TicketsServiceOptions) {
    super(ctx, "tickets");
    this.core = new TicketsCore({
      store: new TicketsStore({ file: options.file }),
      bots: ctx.bots,
      sessions: new DshTicketSessions(ctx),
      sources: options.sources.registry,
      logger: { warn: (message) => ctx.logger.warn(message) },
    });
    options.sources.attach({
      deliver: (sourceId, trigger) => this.core.deliver(sourceId, trigger),
    });
    this.listen(ctx);
  }

  /** The current Tickets and pending Attentions. */
  @Remote("snapshot")
  async snapshot(): Promise<TicketsSnapshot> {
    return this.core.snapshot();
  }

  /**
   * Stream the snapshot on subscription, then again after every write.
   * @param signal - subscription lifetime; aborting ends only this stream.
   */
  @Remote({ mode: "stream" })
  async *watch(signal: AbortSignal): AsyncIterable<TicketsSnapshot> {
    yield* this.core.watch(signal);
  }

  /** Answer one pending Attention; its Ticket reopens and the Session continues. */
  @Remote("answer")
  async answer(request: AnswerAttentionRequest): Promise<TicketsSnapshot> {
    return this.core.answer(request);
  }

  /** Cancel a live Ticket as its Owner: its Session stops and its Attention is withdrawn. */
  @Remote("cancel")
  async cancel(ticketId: string): Promise<TicketsSnapshot> {
    return this.core.cancel(ticketId);
  }

  private listen(ctx: Context): void {
    ctx.on("agent/created", async ({ agent }) => {
      // Awaited before the Agent consumes input, so the Main Bot's first turn
      // already sees the tool.
      try {
        await this.core.attachMainBotTool(agent);
        await this.core.attachTicketTool(agent);
      } catch (error) {
        ctx.logger.warn(`tickets: could not prepare ${String(agent.id)}: ${String(error)}`);
      }
    });
    ctx.on("agent/status", ({ agent, status }) => {
      this.observe(this.core.agentStatus(agent, status));
    });
    ctx.on("agent/error", ({ agent, error }) => {
      this.observe(this.core.agentError(agent, error));
    });
    ctx.on("agent/disposed", ({ agent }) => {
      this.observe(this.core.agentDisposed(agent));
    });
    ctx.on("session/event", (session, event) => {
      if (event.type !== "user/message" || event.data.source.kind !== "user") return;
      this.observe(this.core.ownerMessage(String(session.id)));
    });
    ctx.on("user-questions/request", async (request, next) => {
      const agent = request.agent;
      // Timed questions answer themselves; a Ticket must be blocked on a person.
      if (agent === undefined || request.wait !== undefined) return next();
      const ticket = await this.core.ticketFor(String(agent.id));
      if (ticket === null) return next();
      return this.core.askQuestion(ticket.id, request);
    });
    ctx.on("approval/request", async (request, next) => {
      const ticket = await this.core.ticketFor(String(request.agent.id));
      if (ticket === null) return next();
      return this.core.askApproval(ticket.id, request);
    });
  }

  /** Background work never rejects into an unhandled promise. */
  private observe(work: Promise<unknown>): void {
    void work.catch((error: unknown) => {
      this.ctx.logger.warn(`tickets: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
}
