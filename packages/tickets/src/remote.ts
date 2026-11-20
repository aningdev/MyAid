/**
 * Typert consumer face for `tickets`.
 *
 * The Client mounts this contribution so it gets a typed namespace; the Host
 * side is the `@Remote`-marked `TicketsService`. Every read and write returns
 * the same snapshot, and `watch` streams it after each change.
 */
import { createTypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol/remote-info";
import { z, type ZodType } from "zod";

import { answerAttentionRequestSchema, ticketsSnapshotSchema } from "./wire.ts";

const PACKAGE = "dsh-tickets";

function codec<Value>(typeSymbol: string, schema: ZodType<Value>) {
  return {
    mode: "strict" as const,
    typeSymbol,
    create: () => schema,
  };
}

function input<Value>(name: string, typeSymbol: string, schema: ZodType<Value>) {
  return {
    name,
    source: "json" as const,
    codec: codec(typeSymbol, schema),
    strictCodec: codec(typeSymbol, schema),
  };
}

const snapshotResult = codec(`${PACKAGE}#snapshot:result`, ticketsSnapshotSchema);

export const TYPERT_REMOTE = createTypertRemoteInfo(
  {
    package: PACKAGE,
    methods: {
      "tickets/snapshot": {
        service: "tickets",
        description: "Read Tickets and the pending Attentions, with the current revision.",
        invocation: { kind: "direct" },
        parameters: [],
        result: snapshotResult,
      },
      "tickets/watch": {
        service: "tickets",
        description: "Stream the Tickets snapshot on subscription and after every write.",
        mode: "stream",
        invocation: { kind: "direct" },
        parameters: [],
        cancellation: { parameter: "signal" },
        result: snapshotResult,
      },
      "tickets/answer": {
        service: "tickets",
        description: "Answer one pending Attention; its Ticket reopens and its Session continues.",
        invocation: { kind: "direct" },
        parameters: [input("request", `${PACKAGE}#answer:request`, answerAttentionRequestSchema)],
        result: snapshotResult,
      },
      "tickets/cancel": {
        service: "tickets",
        description: "Cancel a live Ticket as its Owner.",
        invocation: { kind: "direct" },
        parameters: [input("ticketId", `${PACKAGE}#cancel:ticketId`, z.string())],
        result: snapshotResult,
      },
    },
  },
  z,
);

export default TYPERT_REMOTE;
