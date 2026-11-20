/**
 * Ticket, Session and Attention identities. A Ticket Session's id is derived
 * from the Ticket so either side can be found from the other.
 */
import { randomUUID } from "node:crypto";

const TICKET_PREFIX = "ticket-";
const SESSION_PREFIX = "ticket-session-";
const ATTENTION_PREFIX = "attention-";

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

/** A new Attention identity. */
export function newAttentionId(): string {
  return `${ATTENTION_PREFIX}${token()}`;
}
