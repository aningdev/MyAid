/**
 * In-memory `tickets` Remote for tests. It applies the same field changes the
 * UI asks for and pushes the snapshot to `watch`. It is not a second copy of
 * the plugin's rules: a real Host still rejects what this double accepts.
 *
 * A test app (`usesTestStorage`) mirrors the latest Tickets and Attentions
 * into its own Storage so the test process can see a write. That key is not a
 * product cache.
 */
import { Storage } from "nsh";

import { usesTestStorage } from "../../lib/data-root";
import type {
  Attention,
  AttentionAnswer,
  Ticket,
  TicketsGateway,
  TicketsSnapshot,
} from "../../lib/dsh/tickets-gateway";

/** Storage key a Host-less test uses to seed this double. Not a product file. */
export const TICKETS_FIXTURE_KEY = "dsh-bot.test.tickets";

export type MemoryTickets = TicketsGateway & {
  /** A snapshot from outside this Client, as another Device's write would arrive. */
  publish(state: Pick<TicketsSnapshot, "tickets" | "attentions">): void;
};

export function createMemoryTickets(
  initial: Pick<TicketsSnapshot, "tickets" | "attentions">,
): MemoryTickets {
  let tickets = clone(initial.tickets);
  let attentions = clone(initial.attentions);
  let revision = 0;
  const waiters: Array<() => void> = [];

  const picture = (): TicketsSnapshot => ({
    revision,
    tickets: clone(tickets),
    attentions: clone(attentions),
  });

  const emit = (next: { tickets: Ticket[]; attentions: Attention[] }): TicketsSnapshot => {
    tickets = clone(next.tickets);
    attentions = clone(next.attentions);
    revision += 1;
    const published = picture();
    if (usesTestStorage()) {
      void Storage.setItem(
        TICKETS_FIXTURE_KEY,
        JSON.stringify({ tickets: published.tickets, attentions: published.attentions }),
      );
    }
    const pending = waiters.splice(0);
    for (const wake of pending) wake();
    return published;
  };

  const wait = (signal: AbortSignal): Promise<void> =>
    new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const wake = (): void => {
        signal.removeEventListener("abort", wake);
        resolve();
      };
      waiters.push(wake);
      signal.addEventListener("abort", wake, { once: true });
    });

  return {
    async snapshot() {
      return picture();
    },
    async *watch(signal: AbortSignal) {
      let seen = -1;
      while (!signal.aborted) {
        if (revision !== seen) {
          seen = revision;
          yield picture();
          continue;
        }
        await wait(signal);
      }
    },
    async answer(request) {
      const attention = attentions.find((item) => item.id === request.attentionId);
      if (!attention) throw new Error(`tickets/not-found: ${request.attentionId}`);
      if (attention.status !== "pending") throw new Error(`tickets/invalid: ${attention.id}`);
      const stamp = Date.now();
      const answered = attentions.map((item) =>
        item.id === attention.id
          ? { ...item, status: "answered" as const, answer: request.answer, updatedAt: stamp }
          : item,
      );
      const stillPending = answered.some(
        (item) => item.ticketId === attention.ticketId && item.status === "pending",
      );
      const nextTickets = stillPending
        ? tickets
        : tickets.map((ticket) =>
            ticket.id === attention.ticketId && ticket.status === "waiting"
              ? { ...ticket, status: "open" as const, updatedAt: stamp }
              : ticket,
          );
      return emit({ tickets: nextTickets, attentions: answered });
    },
    async cancel(ticketId) {
      const ticket = tickets.find((item) => item.id === ticketId);
      if (!ticket) throw new Error(`tickets/not-found: ${ticketId}`);
      if (ticket.status !== "open" && ticket.status !== "waiting") {
        throw new Error(`tickets/invalid: ${ticketId}`);
      }
      const stamp = Date.now();
      return emit({
        tickets: tickets.map((item) =>
          item.id === ticketId
            ? {
                ...item,
                status: "cancelled" as const,
                endedAt: stamp,
                updatedAt: stamp,
              }
            : item,
        ),
        attentions,
      });
    },
    publish(next) {
      emit(next);
    },
  };
}

function clone<T extends Ticket | Attention>(items: T[]): T[] {
  return items.map((item) =>
    "questions" in item
      ? ({
          ...item,
          questions: item.questions.map((question) => ({
            ...question,
            options: question.options?.map((option) => ({ ...option })) ?? null,
          })),
          approval: item.approval ? { ...item.approval } : null,
          answer: item.answer ? cloneAnswer(item.answer) : null,
        } as T)
      : ({ ...item, origin: { ...item.origin } } as T),
  );
}

function cloneAnswer(answer: AttentionAnswer): AttentionAnswer {
  return answer.kind === "question"
    ? {
        kind: "question",
        answers: answer.answers.map((item) => ({ ...item, selected: [...item.selected] })),
      }
    : { ...answer };
}
