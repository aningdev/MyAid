import { Text, View } from "nsh";
import { colors } from "../../components/ui";
import { ChatPane } from "./ChatPane";

/** Dialogue main: gallery AI Chat pane. */
export function DialogueMain(props: { selectedId: string | null }) {
  // Branch with `<If>` — component bodies run once; a plain `if` would stick on the empty state.
  return (
    <If
      when={props.selectedId}
      else={
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 }}
        >
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>Dialogue</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
            Select a conversation in the list, or start a new chat.
          </Text>
        </View>
      }
    >
      {(id) => <ChatPane selectedId={id()} />}
    </If>
  );
}
