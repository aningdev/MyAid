/**
 * A Session's Panel content: the chat bound to that claimed Session, and the
 * Inspector beside it while this Panel keeps it open. Every Panel gets its own
 * controller, so two Panels can show (and stream) two Sessions at once; two
 * Panels on the same Session share one controller and therefore one transcript,
 * one draft and one approval queue.
 */
import { View } from "nsh";

import { colors } from "../../components/ui";
import { SessionWithInspector } from "../inspector/Inspector";
import { inspectorOpen } from "../inspector/state";
import { ChatPane } from "./ChatPane";
import { controllerFor } from "./session/runtime";

export function SessionPanel(props: { panelId: string; sessionId: string }) {
  return (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, backgroundColor: colors.background }}>
      <If
        when={inspectorOpen(props.panelId)}
        else={<ChatPane controller={controllerFor(props.sessionId)} />}
      >
        <SessionWithInspector panelId={props.panelId}>
          <ChatPane controller={controllerFor(props.sessionId)} />
        </SessionWithInspector>
      </If>
    </View>
  );
}
