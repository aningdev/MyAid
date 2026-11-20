/**
 * `dsh-tickets`: Tickets the Main Bot hands to a Bot, and their Attention.
 *
 * A Ticket runs in its own dsh Session under the target Bot's Agent preset;
 * its status belongs to the Ticket, so a finished Session does not end the
 * work by itself. When the Session needs its Owner, the Ticket raises an
 * Attention instead of blocking silently, and any Device can answer it
 * through the `tickets` Remote.
 */
import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import Schema from "@deepseek-ai/schemastery";

import { TicketsService } from "./service.ts";
import { Sources } from "./sources.ts";

export const PLUGIN_ID = "tickets";
export const name = PLUGIN_ID;

export const inject = ["bots", "sessionController"];

/** What a deployment may set on this plugin's row in `cordis.yml`. */
export interface Config {
  /** Root of this plugin's own data: the Tickets file. Empty means `$DSH_HOME/tickets`. */
  dataDir?: string;
}

export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string().description("Root for the Tickets file; empty means $DSH_HOME/tickets."),
});

/** Resolve the configured data root; the only default this plugin applies. */
function dataRoot(config: Config): string {
  const configured = config.dataDir?.trim() ?? "";
  return configured === "" ? join(resolveDshHome(), PLUGIN_ID) : configured;
}

export function apply(ctx: Context, config: Config): void {
  const sources = new Sources(ctx);
  new TicketsService(ctx, { file: join(dataRoot(config), "tickets.json"), sources });
}

export { TicketsService, type TicketsServiceOptions } from "./service.ts";
export {
  SourceRegistry,
  Sources,
  type SourceChannel,
  type SourceDelivery,
  type SourceInstance,
  type SourceKind,
  type SourceOutbound,
  type SourceRegistration,
  type SourceSendResult,
  type TriggerDelivery,
  type TriggerIntake,
} from "./sources.ts";
export { REPORT_TICKET_TOOL, reportTicketToolInput } from "./tool.ts";
export { newConversationId, sourceSessionIdFor } from "./ids.ts";
export { TICKETS_VERSION } from "./store.ts";
export type { TicketsSnapshot, AnswerAttentionRequest } from "./wire.ts";
export type { OpenTicketRequest, TicketBots } from "./core.ts";
export { OPEN_TICKET_TOOL } from "./tool.ts";
export { sessionIdFor } from "./ids.ts";
export {
  ATTENTION_KINDS,
  ATTENTION_STATUSES,
  TICKET_STATUSES,
  attentionAnswerSchema,
  attentionApprovalSchema,
  attentionKindSchema,
  attentionOptionSchema,
  attentionQuestionSchema,
  attentionSchema,
  attentionStatusSchema,
  isLiveTicket,
  ticketOriginSchema,
  ticketSchema,
  ticketStatusSchema,
  type Attention,
  type AttentionAnswer,
  type AttentionApproval,
  type AttentionKind,
  type AttentionOption,
  type AttentionQuestion,
  type AttentionStatus,
  type QuestionAnswer,
  type Ticket,
  type TicketEnd,
  type TicketOrigin,
  type TicketStatus,
} from "./domain.ts";
