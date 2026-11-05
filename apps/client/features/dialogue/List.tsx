import { Text, View } from "nsh";

import { colors, finish, hovered, Icon, Press, radius } from "../../components/ui";
import { openMain } from "./nav";
import {
  activeSessionId,
  createSession,
  sessionError,
  sessionList,
  sessionReady,
} from "./session/runtime";
import { bumpChatEpoch, selectItem, selectedId } from "./state";

/** Dialogue list: official Sessions + new Session. */
export function DialogueList() {
  const rows = () => sessionList();

  const onNew = () => {
    void (async () => {
      try {
        const id = await createSession();
        selectItem(id);
        bumpChatEpoch();
        openMain(id);
      } catch {
        // sessionError surfaces failure
      }
    })();
  };

  return (
    <View style={{ flex: 1, padding: 12, gap: 2 }}>
      <View desktop={{ windowDrag: true }} style={{ gap: 2 }}>
        <Press onPress={onNew} accessibilityLabel="新建对话">
          <View
            hoverStyle={hovered()}
            style={{
              height: 40,
              borderRadius: radius.control,
              borderCurve: "continuous",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: colors.raised,
              ...finish.raised,
              borderWidth: 1,
              borderColor: colors.border,
              cursor: "pointer",
            }}
          >
            <Icon name="plus" size={15} tint={colors.text} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>新建对话</Text>
          </View>
        </Press>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: colors.faint,
            letterSpacing: 0.6,
            paddingHorizontal: 12,
            paddingTop: 18,
            paddingBottom: 6,
          }}
        >
          SESSIONS
        </Text>
      </View>

      <If
        when={rows().length > 0}
        else={
          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
              paddingHorizontal: 12,
              paddingTop: 8,
              lineHeight: 18,
            }}
          >
            {sessionReady()
              ? "还没有对话。点上方新建。"
              : sessionError() || "连接后台后会列出 Session。"}
          </Text>
        }
      >
        <Each of={rows()}>
          {(row) => {
            const active = () => selectedId() === row().id || activeSessionId() === row().id;
            return (
              <View
                onPress={() => {
                  selectItem(row().id);
                  bumpChatEpoch();
                  openMain(row().id);
                }}
                role="button"
                accessibilityLabel={row().label}
                accessibilityState={{ selected: active() }}
                hoverStyle={active() ? undefined : hovered()}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: radius.control,
                  gap: 2,
                  cursor: "pointer",
                  backgroundColor: active() ? colors.raised : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: active() ? "600" : "400",
                    color: colors.text,
                  }}
                >
                  {row().label}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{row().detail}</Text>
              </View>
            );
          }}
        </Each>
      </If>
    </View>
  );
}
