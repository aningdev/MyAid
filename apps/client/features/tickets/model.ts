import type { AttentionKind, TicketStatus } from "../../lib/dsh/tickets-gateway";
import { t, type MessageKey } from "../../lib/i18n";
import type { Tone } from "../../lib/theme";
/**
 * The words and tones a Ticket surface uses for plugin-owned values. Pure, so
 * a test can read the same decision the view draws.
 */
import { clockLabel, dayLabel } from "../dialogue/chat/time";

const STATUS: Record<TicketStatus, MessageKey> = {
  open: "tickets.status.open",
  waiting: "tickets.status.waiting",
  completed: "tickets.status.completed",
  failed: "tickets.status.failed",
  cancelled: "tickets.status.cancelled",
};

const KINDS: Record<AttentionKind, MessageKey> = {
  question: "attention.question",
  approval: "attention.approval",
};

export function ticketStatusLabel(status: TicketStatus): string {
  return t(STATUS[status]);
}

export function ticketStatusTone(status: TicketStatus): Tone {
  switch (status) {
    case "waiting":
      return "warn";
    case "completed":
      return "up";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

export function attentionKindLabel(kind: AttentionKind): string {
  return t(KINDS[kind]);
}

/** The date and time a Ticket last changed, in the system's date and clock order. */
export function ticketTime(at: number, now: number): string {
  return `${dayLabel(at, now)} ${clockLabel(at)}`;
}
