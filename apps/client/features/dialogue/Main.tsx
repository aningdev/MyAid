import { Text, View } from "nsh";

import { ChatPane } from "./ChatPane";

/** Dialogue main: Session chat pane. */
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
            从左侧新建或选择一个对话，后台会自动连接。
          </Text>
        </View>
      }
    >
      {(id) => <ChatPane selectedId={id()} />}
    </If>
  );
}
