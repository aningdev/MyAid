/**
 * What the Tickets board is showing. It is an overlay over the Workbench, so
 * the Panes keep their layout and scroll while the Owner answers or watches a
 * Ticket. The open view is the only state here; Tickets and Attentions
 * themselves belong to `state.ts`.
 */
import { signal } from "nsh";

export type TicketBoardView =
  | { mode: "inbox" }
  | { mode: "ticket"; ticketId: string; fromInbox: boolean };

export const ticketBoard = signal<TicketBoardView | null>(null);

/** The Navigator's entry: every Attention still waiting, across Bots and Devices. */
export function openAttentionInbox(): void {
  ticketBoard.set({ mode: "inbox" });
}

/** Open one Ticket's process, optionally remembering that the inbox sent us. */
export function openTicket(ticketId: string, options?: { fromInbox?: boolean }): void {
  ticketBoard.set({ mode: "ticket", ticketId, fromInbox: options?.fromInbox ?? false });
}

/** Leave the board. */
export function closeTicketBoard(): void {
  ticketBoard.set(null);
}

/** From a Ticket back to the list it was opened from. */
export function backToAttentionInbox(): void {
  ticketBoard.set({ mode: "inbox" });
}
