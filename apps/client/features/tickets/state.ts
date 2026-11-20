/**
 * The Tickets and Attentions the UI reads. The `tickets` plugin owns them: a
 * connection takes `snapshot`, then follows `watch`, and every write applies
 * the snapshot that comes back. Nothing here is stored on the Device.
 *
 * A Host-less test installs the in-memory gateway (`memory.ts`) instead.
 */
import { Storage, signal } from "nsh";

import { usesTestStorage } from "../../lib/data-root";
import { readableError } from "../../lib/dsh/connection";
import type {
  Attention,
  AttentionAnswer,
  Ticket,
  TicketsGateway,
  TicketsSnapshot,
} from "../../lib/dsh/tickets-gateway";
import { t } from "../../lib/i18n";
import { createMemoryTickets, TICKETS_FIXTURE_KEY, type MemoryTickets } from "./memory";

const EMPTY: TicketsSnapshot = { revision: 0, tickets: [], attentions: [] };

export const ticketsSnapshot = signal<TicketsSnapshot>(EMPTY);
export const ticketsReady = signal(false);
export const ticketsSaving = signal(false);
export const ticketsLoadError = signal<string | null>(null);
export const ticketsActionError = signal<string | null>(null);

let epoch = 0;
let watchAbort: AbortController | undefined;
let gateway: TicketsGateway | undefined;
let seenRevision = -1;

/**
 * Host-less tests: seed the in-memory gateway from the fixture the test put
 * in Storage. A real launch does not call this.
 */
export async function openTestTickets(): Promise<void> {
  if (!usesTestStorage() || gateway) return;
  const text = await Storage.getItem(TICKETS_FIXTURE_KEY);
  if (!text) {
    await followTickets(createMemoryTickets({ tickets: [], attentions: [] }));
    return;
  }
  try {
    const seeded = JSON.parse(text) as { tickets: Ticket[]; attentions: Attention[] };
    await followTickets(createMemoryTickets(seeded));
  } catch (error) {
    ticketsLoadError.set(messageOf(error));
    ticketsReady.set(true);
  }
}

/**
 * Install an in-memory gateway and show `initial`, without a watch loop.
 * Unit tests that only write through the Client use this; a watch test calls
 * {@link followTickets} instead.
 */
export async function useMemoryTickets(
  initial: Pick<TicketsSnapshot, "tickets" | "attentions">,
): Promise<MemoryTickets> {
  const memory = createMemoryTickets(initial);
  epoch += 1;
  watchAbort?.abort();
  watchAbort = undefined;
  gateway = memory;
  seenRevision = -1;
  applySnapshot(await memory.snapshot());
  ticketsLoadError.set(null);
  ticketsReady.set(true);
  return memory;
}

/** Subscribe to `gateway`, replacing any previous watch. */
export async function followTickets(next: TicketsGateway): Promise<void> {
  const mine = ++epoch;
  watchAbort?.abort();
  const controller = new AbortController();
  watchAbort = controller;
  gateway = next;
  try {
    const snapshot = await next.snapshot();
    if (mine !== epoch) return;
    applySnapshot(snapshot);
    ticketsLoadError.set(null);
    ticketsReady.set(true);
  } catch (error) {
    if (mine !== epoch) return;
    ticketsLoadError.set(messageOf(error));
    ticketsReady.set(true);
    return;
  }
  void readWatch(next, controller, mine);
}

/** Drop the subscription. The next connection subscribes again. */
export function stopTickets(): void {
  epoch += 1;
  watchAbort?.abort();
  watchAbort = undefined;
  gateway = undefined;
  seenRevision = -1;
  ticketsReady.set(false);
  ticketsSaving.set(false);
}

export function clearTicketsActionError(): void {
  ticketsActionError.set(null);
}

/** True when a write would not go through (still loading, unreadable, or another write). */
export function ticketsWriteBlocked(): boolean {
  return !ticketsReady() || ticketsLoadError() !== null || ticketsSaving() || gateway === undefined;
}

export async function answerAttention(
  attentionId: string,
  answer: AttentionAnswer,
): Promise<boolean> {
  return write((current) => current.answer({ attentionId, answer }));
}

export async function cancelTicket(ticketId: string): Promise<boolean> {
  return write((current) => current.cancel(ticketId));
}

/** A Bot's Tickets, live ones first and each group newest first. */
export function ticketsForBot(botId: string): Ticket[] {
  return ticketsSnapshot()
    .tickets.filter((ticket) => ticket.botId === botId)
    .sort(byLiveThenRecent);
}

/** Every Attention still waiting on the Owner, newest first. */
export function pendingAttentions(): Attention[] {
  return ticketsSnapshot()
    .attentions.filter((attention) => attention.status === "pending")
    .sort((left, right) => right.createdAt - left.createdAt);
}

/** The Attentions still waiting on a Ticket, oldest first (the order to answer them). */
export function pendingAttentionsFor(ticketId: string): Attention[] {
  return ticketsSnapshot()
    .attentions.filter(
      (attention) => attention.ticketId === ticketId && attention.status === "pending",
    )
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function ticketById(ticketId: string): Ticket | undefined {
  return ticketsSnapshot().tickets.find((ticket) => ticket.id === ticketId);
}

async function write(run: (current: TicketsGateway) => Promise<TicketsSnapshot>): Promise<boolean> {
  const current = gateway;
  if (ticketsWriteBlocked() || !current) return false;
  ticketsSaving.set(true);
  ticketsActionError.set(null);
  try {
    applySnapshot(await run(current));
    return true;
  } catch (error) {
    ticketsActionError.set(messageOf(error));
    return false;
  } finally {
    ticketsSaving.set(false);
  }
}

async function readWatch(
  source: TicketsGateway,
  controller: AbortController,
  mine: number,
): Promise<void> {
  try {
    for await (const snapshot of source.watch(controller.signal)) {
      if (mine !== epoch) return;
      applySnapshot(snapshot);
    }
  } catch (error) {
    if (mine !== epoch || controller.signal.aborted) return;
    ticketsLoadError.set(messageOf(error));
  }
}

function applySnapshot(snapshot: TicketsSnapshot): void {
  if (snapshot.revision < seenRevision) return;
  seenRevision = snapshot.revision;
  ticketsSnapshot.set(snapshot);
}

function byLiveThenRecent(left: Ticket, right: Ticket): number {
  const live = Number(isLive(right)) - Number(isLive(left));
  return live !== 0 ? live : right.updatedAt - left.updatedAt;
}

function isLive(ticket: Ticket): boolean {
  return ticket.status === "open" || ticket.status === "waiting";
}

function messageOf(error: unknown): string {
  if (isRemoteError(error)) return error.message || t("tickets.loadFailed");
  return readableError(error);
}

function isRemoteError(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isDSHRemoteError?: unknown }).isDSHRemoteError === true
  );
}
