/**
 * The dsh side of a Ticket: create the Session that runs it, deliver work into
 * it, stop it, and report back to the Main Bot's Session.
 *
 * Messages this plugin delivers carry a `tickets` source, never `user`: only a
 * person typing in the Ticket Session counts as the Owner's own new work.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-api-session-controller";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";

declare module "@deepseek-ai/dsh-llm" {
  interface MessageSourceMap {
    /** Work delivered by this plugin; `form` says which way it travels. */
    tickets: {
      kind: "tickets";
      form: "request" | "report" | "trigger";
      /** The Ticket this message belongs to; null for a Source Trigger. */
      ticketId: string | null;
      /** The Source Trigger that brought a person's message in. */
      triggerId?: string;
      /** The Source instance the Trigger came from. */
      source?: string;
    };
  }
}

/** What starting a Ticket Session needs. */
export type TicketSessionStart = {
  sessionId: string;
  /** Directory the Session works in; the Bot's default applies when null. */
  cwd: string | null;
  /** The Agent preset of the Bot the Ticket was handed to. */
  agentPreset: string;
  title: string;
};

/** Everything the core needs from dsh, kept narrow so tests can stand in. */
export interface TicketSessions {
  /** Create the Ticket Session, resume its Agent, and name it. */
  start(target: TicketSessionStart): Promise<void>;
  /** Deliver the Ticket's request into its Session. */
  prompt(sessionId: string, ticketId: string, text: string): Promise<void>;
  /** Stop the Ticket Session. */
  cancel(sessionId: string): Promise<void>;
  /** Report a finished Ticket back into the Main Bot's Session. */
  notify(sessionId: string, ticketId: string, text: string): Promise<void>;
  /** Deliver one Source Trigger into the Session that follows its thread. */
  trigger(
    sessionId: string,
    trigger: { triggerId: string; source: string },
    text: string,
  ): Promise<void>;
  /** The Session this one was started by, for sub-agent Sessions. */
  parentSession(sessionId: string): Promise<string | null>;
}

export class DshTicketSessions implements TicketSessions {
  private readonly ctx: Context;

  constructor(ctx: Context) {
    this.ctx = ctx;
  }

  async start(target: TicketSessionStart): Promise<void> {
    await this.ctx.sessionController.create({
      sessionId: SessionId(target.sessionId),
      ...(target.cwd === null ? {} : { cwd: target.cwd }),
      agentPreset: target.agentPreset,
    });
    await this.agent(target.sessionId);
    try {
      await this.ctx.sessionController.rename({
        sessionId: SessionId(target.sessionId),
        title: target.title,
      });
    } catch (error) {
      // A deployment without the session-title service still runs the Ticket.
      this.ctx.logger.warn(
        `tickets: could not title Session ${target.sessionId}: ${String(error)}`,
      );
    }
  }

  async prompt(sessionId: string, ticketId: string, text: string): Promise<void> {
    const agent = await this.agent(sessionId);
    agent.followup(message(ticketId, "request", text));
  }

  async cancel(sessionId: string): Promise<void> {
    this.ctx.sessionController.cancel({ sessionId: SessionId(sessionId) });
  }

  async notify(sessionId: string, ticketId: string, text: string): Promise<void> {
    const agent = await this.agent(sessionId);
    agent.followup(message(ticketId, "report", text));
  }

  async trigger(
    sessionId: string,
    trigger: { triggerId: string; source: string },
    text: string,
  ): Promise<void> {
    const agent = await this.agent(sessionId);
    agent.followup(
      createUserMessage({
        content: [{ type: "text", text }],
        source: {
          kind: "tickets",
          form: "trigger",
          ticketId: null,
          triggerId: trigger.triggerId,
          source: trigger.source,
        },
      }),
    );
  }

  async parentSession(sessionId: string): Promise<string | null> {
    const parent = this.ctx.agents.get(SessionId(sessionId))?.session.header.parentSession;
    return parent === undefined ? null : String(parent);
  }

  private async agent(sessionId: string): Promise<Agent> {
    const resolved = await this.ctx.sessionController.resolveAgent(SessionId(sessionId));
    if ("error" in resolved) {
      throw new Error(
        `tickets: Session ${sessionId} 无法打开：${resolved.error.message ?? resolved.error.code}`,
      );
    }
    return resolved.agent;
  }
}

function message(ticketId: string, form: "request" | "report", text: string) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "tickets", form, ticketId },
  });
}
