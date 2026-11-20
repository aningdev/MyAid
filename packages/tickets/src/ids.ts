/**
 * Ticket, Session and Attention identities. A Ticket Session's id is derived
 * from the Ticket so either side can be found from the other.
 */
import { randomUUID } from "node:crypto";

const TICKET_PREFIX = "ticket-";
const SESSION_PREFIX = "ticket-session-";
const ATTENTION_PREFIX = "attention-";
const CONVERSATION_PREFIX = "source-conversation-";
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
export function sourceSessionIdFor(conversationId: string): string {
  return `${SOURCE_SESSION_PREFIX}${conversationId.slice(CONVERSATION_PREFIX.length)}`;
}

/** A new Source conversation identity. */
export function newConversationId(): string {
  return `${CONVERSATION_PREFIX}${token()}`;
}

/** A new Attention identity. */
export function newAttentionId(): string {
  return `${ATTENTION_PREFIX}${token()}`;
}
