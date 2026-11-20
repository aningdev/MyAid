/**
 * The mounted `tickets` namespace as a {@link TicketsGateway}. Direct calls
 * come back as Typert results; `watch` yields snapshots.
 */
import type { TicketsGateway, TicketsNamespace, TicketsSnapshot } from "./tickets-gateway";

export function liveTickets(namespace: TicketsNamespace): TicketsGateway {
  return {
    snapshot: () => asSnapshot(namespace.snapshot()),
    watch: (signal) => watch(namespace, signal),
    answer: (request) => asSnapshot(namespace.answer(request)),
    cancel: (ticketId) => asSnapshot(namespace.cancel(ticketId)),
  };
}

async function* watch(
  namespace: TicketsNamespace,
  signal: AbortSignal,
): AsyncIterable<TicketsSnapshot> {
  for await (const item of namespace.watch(signal)) {
    yield unwrapSnapshot(item);
  }
}

async function asSnapshot(result: Promise<unknown>): Promise<TicketsSnapshot> {
  return unwrapSnapshot(await result);
}

function unwrapSnapshot(result: unknown): TicketsSnapshot {
  if (isResult(result)) {
    if (result.ok !== true) {
      const error = result.error ?? { code: "unknown/error", message: String(result) };
      throw new Error(`${error.code ?? "unknown/error"}: ${error.message ?? ""}`);
    }
    return result.value as TicketsSnapshot;
  }
  return result as TicketsSnapshot;
}

function isResult(
  value: unknown,
): value is { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } {
  return typeof value === "object" && value !== null && "ok" in value;
}
