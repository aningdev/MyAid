/**
 * The Ticket and Attention state machines, as pure functions over the stored
 * shapes. Nothing here knows about dsh, Sessions or devices, so every
 * transition is testable without a Host.
 *
 * A Ticket's status belongs to the Ticket, not to the Session that runs it: a
 * Session going idle ends its turn, not necessarily the work. The Session is
 * only the place the work happens (decision 0002).
 */
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import { z } from "zod";

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface RemoteErrorDetailsMap {
    /** No Ticket, Attention or Bot matches the reference. */
    "tickets/not-found": { readonly message: string };
    /** The requested transition is not allowed from the current state. */
    "tickets/invalid": { readonly message: string };
  }
}

/** A Ticket's life: live work, a person's attention, or an end. */
export const TICKET_STATUSES = ["open", "waiting", "completed", "failed", "cancelled"] as const;
export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

/** A person's identity on one Source; never mapped across Sources. */
export const ownerIdentitySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
});
export type OwnerIdentity = z.infer<typeof ownerIdentitySchema>;

/** One conversation a Source can write into. */
export const channelRefSchema = z.object({
  /** The configured Source instance. */
  source: z.string(),
  /** The Source's own thread id. */
  thread: z.string(),
  /** Where inside that thread a reply goes. */
  address: z.string(),
});
export type ChannelRef = z.infer<typeof channelRefSchema>;

/** One accepted or ignored event a Source delivered. Immutable once written. */
export const triggerSchema = z.object({
  id: z.string(),
  source: channelRefSchema.shape.source,
  thread: channelRefSchema.shape.thread,
  address: channelRefSchema.shape.address,
  at: z.number(),
  /** The person who wrote it, when the Source can tell. */
  human: ownerIdentitySchema.nullable(),
  text: z.string(),
  /**
   * Decided once, at intake: only the Owner's identity starts work. An
   * ignored Trigger is kept as history and never reaches a Session or Channel.
   */
  disposition: z.enum(["accepted", "ignored"]),
});
export type Trigger = z.infer<typeof triggerSchema>;

/** A Source instance a plugin registered, as the Remote reports it. */
export const sourceSummarySchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.object({ zh: z.string(), en: z.string() }),
  /** The Owner's identity on this Source. */
  owner: z.string(),
  enabled: z.boolean(),
});
export type SourceSummary = z.infer<typeof sourceSummarySchema>;

/** One Source thread kept in the Main Bot's Dialogue. */
export const conversationSchema = z.object({
  id: z.string(),
  source: z.string(),
  thread: z.string(),
  sessionId: z.string(),
  createdAt: z.number(),
});
export type Conversation = z.infer<typeof conversationSchema>;

/** A Trigger that already got its one Channel reply. */
export const triggerAnswerSchema = z.object({
  triggerId: z.string(),
  at: z.number(),
});
export type TriggerAnswer = z.infer<typeof triggerAnswerSchema>;

/** Where a Ticket came from: the Main Bot's Session, or a Source Trigger. */
export const ticketOriginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("main-bot"), sessionId: z.string() }),
  z.object({
    kind: z.literal("source"),
    source: z.string(),
    sourceKind: z.string(),
    triggerId: z.string(),
    thread: z.string(),
    address: z.string(),
  }),
]);
export type TicketOrigin = z.infer<typeof ticketOriginSchema>;

export const ticketSchema = z.object({
  id: z.string(),
  botId: z.string(),
  title: z.string(),
  request: z.string(),
  origin: ticketOriginSchema,
  status: ticketStatusSchema,
  sessionId: z.string().nullable(),
  workspacePath: z.string().nullable(),
  result: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  endedAt: z.number().nullable(),
});
export type Ticket = z.infer<typeof ticketSchema>;

/** One choice an Attention question offers. */
export const attentionOptionSchema = z.object({
  label: z.string(),
  description: z.string().nullable(),
});
export type AttentionOption = z.infer<typeof attentionOptionSchema>;

/** One question an Attention asks, flattened for every device to render. */
export const attentionQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  header: z.string().nullable(),
  options: z.array(attentionOptionSchema).nullable(),
  multiSelect: z.boolean(),
  intent: z.string().nullable(),
});
export type AttentionQuestion = z.infer<typeof attentionQuestionSchema>;

/** What an Attention asks a person to review, for `kind: "approval"`. */
export const attentionApprovalSchema = z.object({
  toolName: z.string(),
  reason: z.string().nullable(),
});
export type AttentionApproval = z.infer<typeof attentionApprovalSchema>;

export const ATTENTION_KINDS = ["question", "approval"] as const;
export const attentionKindSchema = z.enum(ATTENTION_KINDS);
export type AttentionKind = z.infer<typeof attentionKindSchema>;

export const ATTENTION_STATUSES = ["pending", "answered", "withdrawn"] as const;
export const attentionStatusSchema = z.enum(ATTENTION_STATUSES);
export type AttentionStatus = z.infer<typeof attentionStatusSchema>;

/** The answer one person gave, kept after the Attention settles. */
export const attentionAnswerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    answers: z.array(
      z.object({
        questionId: z.string(),
        selected: z.array(z.string()),
        custom: z.string().optional(),
      }),
    ),
  }),
  z.object({
    kind: z.literal("approval"),
    decision: z.enum(["allow", "reject"]),
  }),
]);
export type AttentionAnswer = z.infer<typeof attentionAnswerSchema>;
export type QuestionAnswer = Extract<AttentionAnswer, { kind: "question" }>;

export const attentionSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  kind: attentionKindSchema,
  prompt: z.string(),
  questions: z.array(attentionQuestionSchema),
  approval: attentionApprovalSchema.nullable(),
  status: attentionStatusSchema,
  answer: attentionAnswerSchema.nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Attention = z.infer<typeof attentionSchema>;

/** A Ticket or Attention operation the caller may not perform as asked. */
export class TicketError extends RemoteError<"tickets/not-found" | "tickets/invalid"> {
  constructor(code: "tickets/not-found" | "tickets/invalid", message: string) {
    super(code, message, { message });
    this.name = "TicketError";
  }
}

/** Whether the Ticket is still live (can open, wait, or end). */
export function isLiveTicket(ticket: Ticket): boolean {
  return ticket.status === "open" || ticket.status === "waiting";
}

export type NewTicket = {
  id: string;
  botId: string;
  title: string;
  request: string;
  origin: TicketOrigin;
  sessionId: string | null;
  workspacePath: string | null;
};

/** Start a Ticket in `open`. */
export function createTicket(input: NewTicket, now: number): Ticket {
  return {
    ...input,
    status: "open",
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    endedAt: null,
  };
}

function transited(ticket: Ticket, patch: Partial<Ticket>, now: number): Ticket {
  return { ...ticket, ...patch, updatedAt: now };
}

function refuse(ticket: Ticket, operation: string): never {
  throw new TicketError(
    "tickets/invalid",
    `Ticket ${ticket.id} 当前是 ${ticket.status}，不能${operation}。`,
  );
}

/** `open → waiting`: the Session asked its person something. */
export function raiseTicket(ticket: Ticket, now: number): Ticket {
  if (ticket.status !== "open") refuse(ticket, "再次请求 Owner");
  return transited(ticket, { status: "waiting" }, now);
}

/** `waiting → open`: the Attention was answered or withdrawn. */
export function resumeTicketWork(ticket: Ticket, now: number): Ticket {
  if (ticket.status !== "waiting") refuse(ticket, "从等待中恢复");
  return transited(ticket, { status: "open" }, now);
}

export type TicketEnd =
  | { kind: "completed"; result: string }
  | { kind: "failed"; error: string }
  | { kind: "cancelled" };

/**
 * End a live Ticket. A cancelled Ticket is terminal; a completed or failed one
 * comes back to `open` through {@link restoreTicket} when its person writes in
 * the Ticket Session again.
 */
export function endTicket(ticket: Ticket, end: TicketEnd, now: number): Ticket {
  if (!isLiveTicket(ticket)) refuse(ticket, "结束");
  return transited(
    ticket,
    {
      status: end.kind,
      result: end.kind === "completed" ? end.result : null,
      error: end.kind === "failed" ? end.error : null,
      endedAt: now,
    },
    now,
  );
}

/** `completed | failed → open`: the person's new message is new work. */
export function restoreTicket(ticket: Ticket, now: number): Ticket {
  if (ticket.status !== "completed" && ticket.status !== "failed") {
    refuse(ticket, "被新消息恢复");
  }
  return transited(ticket, { status: "open", result: null, error: null, endedAt: null }, now);
}

export type NewAttention = {
  id: string;
  ticketId: string;
  kind: AttentionKind;
  prompt: string;
  questions: AttentionQuestion[];
  approval: AttentionApproval | null;
};

/** Ask a person something for a live Ticket. */
export function createAttention(input: NewAttention, now: number): Attention {
  return {
    ...input,
    status: "pending",
    answer: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Settle a pending Attention with the person's answer. */
export function answerAttention(
  attention: Attention,
  answer: AttentionAnswer,
  now: number,
): Attention {
  if (attention.status !== "pending") {
    throw new TicketError(
      "tickets/invalid",
      `Attention ${attention.id} 当前是 ${attention.status}，不能再回答。`,
    );
  }
  if (answer.kind !== attention.kind) {
    throw new TicketError(
      "tickets/invalid",
      `Attention ${attention.id} 是 ${attention.kind}，不能用 ${answer.kind} 回答。`,
    );
  }
  return { ...attention, status: "answered", answer, updatedAt: now };
}

/** Withdraw a pending Attention: the Ticket was cancelled or its Session left. */
export function withdrawAttention(attention: Attention, now: number): Attention {
  if (attention.status !== "pending") {
    throw new TicketError(
      "tickets/invalid",
      `Attention ${attention.id} 当前是 ${attention.status}，不能撤回。`,
    );
  }
  return { ...attention, status: "withdrawn", updatedAt: now };
}
