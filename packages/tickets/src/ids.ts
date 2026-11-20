/**
 * Ticket, Session and Attention identities. A Ticket Session's id is derived
 * from the Ticket so either side can be found from the other.
 */
import { randomUUID } from "node:crypto";

const TICKET_PREFIX = "ticket-";
const SESSION_PREFIX = "ticket-session-";
const ATTENTION_PREFIX = "attention-";
const SOURCE_THREAD_PREFIX = "source-thread-";
const SOURCE_SESSION_PREFIX = "source-session-";

function token(): string {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

/** A new Ticket identity. */
export function newTicketId(): string {
  return `${TICKET_PREFIX}${token()}`;
}

/** The Session that runs one Ticket. */
export function sessionIdFor(ticketId: string): string {
  return `${SESSION_PREFIX}${ticketId.slice(TICKET_PREFIX.length)}`;
}

/** The Main Bot Session that follows one Source thread. */
export function sourceSessionIdFor(threadId: string): string {
  return `${SOURCE_SESSION_PREFIX}${threadId.slice(SOURCE_THREAD_PREFIX.length)}`;
}

/** A new Source thread identity. */
export function newSourceThreadId(): string {
  return `${SOURCE_THREAD_PREFIX}${token()}`;
}

/** A new Attention identity. */
export function newAttentionId(): string {
  return `${ATTENTION_PREFIX}${token()}`;
}
