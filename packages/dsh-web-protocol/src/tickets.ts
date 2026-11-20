/**
 * Wire DTOs of `dsh-tickets`' `tickets` Remote.
 *
 * Client-side types only: the plugin owns the same shapes in its own source and
 * must not depend on this package.
 */

export type TicketStatus = "open" | "waiting" | "completed" | "failed" | "cancelled";

/** A person's identity on one Source. */
export type OwnerIdentity = {
  id: string;
  name: string | null;
};

/** One thread a Source can write into. */
export type ChannelRef = {
  source: string;
  thread: string;
  address: string;
};

/** One accepted or ignored event a Source delivered. */
export type Trigger = {
  id: string;
  source: string;
  thread: string;
  address: string;
  at: number;
  human: OwnerIdentity | null;
  text: string;
  disposition: "accepted" | "ignored";
};

/** A Source instance a plugin registered. */
export type SourceSummary = {
  id: string;
  kind: string;
  title: { zh: string; en: string };
  owner: string;
  enabled: boolean;
};

/** One Source thread kept in the Main Bot's Dialogue. */
export type SourceThread = {
  id: string;
  source: string;
  thread: string;
  sessionId: string;
  createdAt: number;
};

/** A Trigger that already got its one Channel reply. */
export type TriggerAnswer = {
  triggerId: string;
  at: number;
};

/** Where a Ticket came from: the Main Bot's Session, or a Source Trigger. */
export type TicketOrigin =
  | { kind: "main-bot"; sessionId: string }
  | {
      kind: "source";
      source: string;
      sourceKind: string;
      triggerId: string;
      thread: string;
      address: string;
    };

/** One unit of work a Bot executes for the Owner. */
export type Ticket = {
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
};

export type AttentionKind = "question" | "approval";
export type AttentionStatus = "pending" | "answered" | "withdrawn";

export type AttentionOption = {
  label: string;
  description: string | null;
};

export type AttentionQuestion = {
  id: string;
  question: string;
  header: string | null;
  options: AttentionOption[] | null;
  multiSelect: boolean;
  intent: string | null;
};

export type AttentionApproval = {
  toolName: string;
  reason: string | null;
};

export type QuestionAnswer = {
  questionId: string;
  selected: string[];
  custom?: string;
};

export type AttentionAnswer =
  | { kind: "question"; answers: QuestionAnswer[] }
  | { kind: "approval"; decision: "allow" | "reject" };

/** A decision the Owner owes a Ticket. */
export type Attention = {
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
};

/** What every `tickets` remote read and write returns. */
export type TicketsSnapshot = {
  revision: number;
  tickets: Ticket[];
  attentions: Attention[];
  /** Configured Sources, so the Owner can see where work comes from. */
  sources: SourceSummary[];
  /** Delivered Triggers, ignored ones included, as history. */
  triggers: Trigger[];
  /** Source Threads that already have a Main Bot Session. */
  sourceThreads: SourceThread[];
};

/** Answer one pending Attention. */
export type AnswerAttentionRequest = {
  attentionId: string;
  answer: AttentionAnswer;
};
