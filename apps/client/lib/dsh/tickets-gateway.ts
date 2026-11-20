/**
 * The Client's view of the `tickets` Remote. Production wraps the mounted
 * namespace; tests install an in-memory one. Every successful call returns
 * the snapshot the plugin would return.
 *
 * Wire shapes come from `@dsh-bot/dsh-web-protocol/tickets`, the Client-only
 * mirror of `packages/tickets`' own DTOs.
 */
import type { AnswerAttentionRequest, TicketsSnapshot } from "@dsh-bot/dsh-web-protocol/tickets";

export type {
  Attention,
  AttentionAnswer,
  AttentionApproval,
  AttentionKind,
  AttentionOption,
  AttentionQuestion,
  AttentionStatus,
  AnswerAttentionRequest,
  ChannelRef,
  OwnerIdentity,
  QuestionAnswer,
  SourceSummary,
  SourceThread,
  Ticket,
  TicketOrigin,
  TicketStatus,
  TicketsSnapshot,
  Trigger,
} from "@dsh-bot/dsh-web-protocol/tickets";

/** Methods the Client calls. Names match the `tickets` Remote. */
export interface TicketsGateway {
  snapshot(): Promise<TicketsSnapshot>;
  watch(signal: AbortSignal): AsyncIterable<TicketsSnapshot>;
  answer(request: AnswerAttentionRequest): Promise<TicketsSnapshot>;
  cancel(ticketId: string): Promise<TicketsSnapshot>;
}

/** The mounted namespace, before results are unwrapped. */
export type TicketsNamespace = {
  snapshot(): Promise<unknown>;
  watch(signal: AbortSignal): AsyncIterable<unknown>;
  answer(request: AnswerAttentionRequest): Promise<unknown>;
  cancel(ticketId: string): Promise<unknown>;
};
