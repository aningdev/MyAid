/**
 * Wire shapes shared by the `tickets` Remote and its Host service.
 */
import { z } from "zod";

import {
  attentionAnswerSchema,
  attentionSchema,
  sourceThreadSchema,
  sourceSummarySchema,
  ticketSchema,
  triggerSchema,
} from "./domain.ts";

/** What every `tickets` remote read and write returns. */
export const ticketsSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  tickets: z.array(ticketSchema),
  attentions: z.array(attentionSchema),
  /** Configured Sources, so the Owner can see where work comes from. */
  sources: z.array(sourceSummarySchema),
  /** Delivered Triggers, ignored ones included, as history. */
  triggers: z.array(triggerSchema),
  /** Source Threads that already have a Main Bot Session. */
  sourceThreads: z.array(sourceThreadSchema),
});
export type TicketsSnapshot = z.infer<typeof ticketsSnapshotSchema>;

/** Answer one pending Attention. */
export const answerAttentionRequestSchema = z.object({
  attentionId: z.string(),
  answer: attentionAnswerSchema,
});
export type AnswerAttentionRequest = z.infer<typeof answerAttentionRequestSchema>;
