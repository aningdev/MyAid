/**
 * A Session's Panel content: the chat bound to that claimed Session. Every
 * Panel gets its own controller, so two Panels can show (and stream) two
 * Sessions at once; two Panels on the same Session share one controller and
 * therefore one transcript, one draft and one approval queue.
 */
import { View } from "nsh";

import { colors } from "../../components/ui";
import { ChatPane } from "./ChatPane";
import { controllerFor } from "./session/runtime";

export function SessionPanel(props: { panelId: string; sessionId: string }) {
  return (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, backgroundColor: colors.background }}>
      <ChatPane controller={controllerFor(props.sessionId)} />
    </View>
  );
}
