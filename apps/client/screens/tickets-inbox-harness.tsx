/**
 * Test-only entry: the Owner's Attention inbox at a phone's width — what waits
 * on this Device, with no Dialogue mixed in.
 */
import { mount, View } from "nsh";

import { openAttentionInbox } from "../features/tickets/board";
import { TicketBoard } from "../features/tickets/TicketBoard";
import { seedTickets } from "./tickets-seed";

function Harness() {
  seedTickets();
  openAttentionInbox();
  return (
    <View style={{ flex: 1 }}>
      <TicketBoard />
    </View>
  );
}

mount(Harness);
