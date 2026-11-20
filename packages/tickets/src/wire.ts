/**
 * Wire shapes shared by the `tickets` Remote and its Host service.
 */
import { z } from "zod";

import { attentionAnswerSchema, attentionSchema, ticketSchema } from "./domain.ts";

/** What every `tickets` remote read and write returns. */
export const ticketsSnapshotSchema = z.object({
  revision: z.number().int().nonnegative(),
  tickets: z.array(ticketSchema),
  attentions: z.array(attentionSchema),
});
export type TicketsSnapshot = z.infer<typeof ticketsSnapshotSchema>;

/** Answer one pending Attention. */
export const answerAttentionRequestSchema = z.object({
  attentionId: z.string(),
  answer: attentionAnswerSchema,
});
export type AnswerAttentionRequest = z.infer<typeof answerAttentionRequestSchema>;
