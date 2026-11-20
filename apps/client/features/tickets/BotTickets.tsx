/**
 * The Tickets one Bot has executed, at the top of its Pane. A row opens the
 * Ticket's own process; the rows are not Dialogue turns and the Ticket's
 * Session is not one of this Bot's segments.
 */
import { Scroll, Text, token, View } from "nsh";

import { Badge } from "../../components/ui/badge";
import { Pressable } from "../../components/ui/pressable";
import { t } from "../../lib/i18n";
import { listRow } from "../../lib/surface";
import { openTicket } from "./board";
import { ticketStatusLabel, ticketStatusTone, ticketTime } from "./model";
import { ticketsForBot } from "./state";

export function BotTickets(props: { botId: string }) {
  const rows = () => ticketsForBot(props.botId);
  return (
    <If when={rows().length > 0}>
      <View
        testID="bot-tickets"
        style={{
          flexShrink: 0,
          borderBottomWidth: 1,
          borderBottomColor: token("line"),
          backgroundColor: token("background"),
          paddingTop: 6,
          paddingBottom: 6,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingBottom: 4,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: token("muted-foreground") }}>
            {t("tickets.title")}
          </Text>
          <Badge>{String(rows().length)}</Badge>
        </View>
        <Scroll style={{ maxHeight: 152 }} contentStyle={{ paddingHorizontal: 4 }}>
          <Each of={rows()} key={(ticket) => ticket.id}>
            {(ticket) => (
              <Pressable
                testID={`bot-ticket-${ticket().id}`}
                accessibilityLabel={ticket().title}
                {...listRow()}
                onPress={() => openTicket(ticket().id)}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "500",
                      color: token("foreground"),
                      numberOfLines: 1,
                    }}
                  >
                    {ticket().title}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: token("muted-foreground"),
                      numberOfLines: 1,
                    }}
                  >
                    {ticketTime(ticket().updatedAt, Date.now())}
                  </Text>
                </View>
                <Badge tone={ticketStatusTone(ticket().status)} variant="outline">
                  {ticketStatusLabel(ticket().status)}
                </Badge>
              </Pressable>
            )}
          </Each>
        </Scroll>
      </View>
    </If>
  );
}
