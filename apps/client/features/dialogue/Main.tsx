import { Text, View } from "nsh";

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
          <Text class="text-lg font-semibold text-foreground">Dialogue</Text>
          <Text class="text-sm text-center text-muted-foreground">
            Select a conversation in the list, or start a new chat.
          </Text>
        </View>
      }
    >
      {(id) => <ChatPane selectedId={id()} />}
    </If>
  );
}
