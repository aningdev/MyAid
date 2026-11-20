/**
 * Test-only entry: the Tickets a Bot executed, at a phone's width, in the
 * band they take at the top of its Pane.
 */
import { mount, Text, token, View } from "nsh";

import { BotMark } from "../features/bots/BotMark";
import { registry } from "../features/bots/state";
import { BotTickets } from "../features/tickets/BotTickets";
import { seedTickets } from "./tickets-seed";

function Harness() {
  seedTickets();
  const bot = () => registry().bots[0]!;
  return (
    <View style={{ flex: 1, backgroundColor: token("background") }}>
      <View
        style={{
          height: 36,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 8,
          borderBottomWidth: 1,
          borderBottomColor: token("line"),
        }}
      >
        <BotMark identity={bot().identity} size={16} />
        <Text style={{ fontSize: 13, fontWeight: "500", color: token("foreground") }}>
          {bot().name}
        </Text>
      </View>
      <BotTickets botId={bot().id} />
      <View style={{ flex: 1 }} />
    </View>
  );
}

mount(Harness);
