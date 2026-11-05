import { Text, View } from "nsh";

import { colors } from "../../components/ui";
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
          <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>Dialogue</Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}>
            从左侧新建或选择一个对话，后台会自动连接。
          </Text>
        </View>
      }
    >
      {(id) => <ChatPane selectedId={id()} />}
    </If>
  );
}
