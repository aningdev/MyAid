/**
 * The Client's view of the `tickets` Remote. Production wraps the mounted
 * namespace; tests install an in-memory one. Every successful call returns
 * the snapshot the plugin would return.
 *
 * The wire shapes mirror `packages/tickets/src/domain.ts`. That package does
 * not publish a protocol entry point yet, and this directory does not import
 * plugin sources, so the DTOs live here until a shared protocol package
 * exists.
 */

/** Where a Ticket came from: the Main Bot's Session that opened it. */
export interface TicketOrigin {
  kind: "main-bot";
  sessionId: string;
}

export type TicketStatus = "open" | "waiting" | "completed" | "failed" | "cancelled";

/** One unit of work a Bot executes for the Owner. */
export interface Ticket {
  id: string;
  botId: string;
  title: string;
  request: string;
  origin: TicketOrigin;
  status: TicketStatus;
  sessionId: string | null;
  workspacePath: string | null;
  result: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  endedAt: number | null;
}

export type AttentionKind = "question" | "approval";
export type AttentionStatus = "pending" | "answered" | "withdrawn";

export interface AttentionOption {
  label: string;
  description: string | null;
}

export interface AttentionQuestion {
  id: string;
  question: string;
  header: string | null;
  options: AttentionOption[] | null;
  multiSelect: boolean;
  intent: string | null;
}

export interface AttentionApproval {
  toolName: string;
  reason: string | null;
}

export interface QuestionAnswer {
  questionId: string;
  selected: string[];
  custom?: string;
}

export type AttentionAnswer =
  | { kind: "question"; answers: QuestionAnswer[] }
  | { kind: "approval"; decision: "allow" | "reject" };

/** A decision the Owner owes a Ticket. */
export interface Attention {
  id: string;
  ticketId: string;
  kind: AttentionKind;
  prompt: string;
  questions: AttentionQuestion[];
  approval: AttentionApproval | null;
  status: AttentionStatus;
  answer: AttentionAnswer | null;
  createdAt: number;
  updatedAt: number;
}

export interface AnswerAttentionRequest {
  attentionId: string;
  answer: AttentionAnswer;
}

/** The whole Ticket and Attention state at one revision. */
export interface TicketsSnapshot {
  revision: number;
  tickets: Ticket[];
  attentions: Attention[];
}

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
