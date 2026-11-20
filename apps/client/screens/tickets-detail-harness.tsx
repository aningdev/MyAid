/**
 * Test-only entry: one Ticket's own process at a phone's width, as the board
 * draws it — status, request, the Attentions it waits on and its Session.
 */
import { mount, View } from "nsh";

import { openTicket } from "../features/tickets/board";
import { TicketBoard } from "../features/tickets/TicketBoard";
import { seedTickets } from "./tickets-seed";

function Harness() {
  seedTickets();
  openTicket("tidy");
  return (
    <View style={{ flex: 1 }}>
      <TicketBoard />
    </View>
  );
}

mount(Harness);
