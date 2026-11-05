import { Text, View } from "nsh";

import { colors, finish, hovered, Icon, Press, radius } from "../../components/ui";
import { openMain } from "./nav";
import { beginNewChat, conversations, selectedId } from "./state";

/** Dialogue list: gallery AI Chat conversations / scenarios. */
export function DialogueList() {
  const newActive = () => selectedId() === "new";
  return (
    <View style={{ flex: 1, padding: 12, gap: 2 }}>
      <Press
        onPress={() => {
          beginNewChat();
          openMain("new");
        }}
        accessibilityLabel="New chat"
        accessibilityState={{ selected: newActive() }}
        hoverStyle={newActive() ? undefined : hovered()}
      >
        <View
          class="min-h-11 flex-row items-center justify-center gap-2"
          style={{
            borderRadius: radius.control,
            borderCurve: "continuous",
            backgroundColor: colors.raised,
            ...finish.raised,
            borderWidth: 1,
            borderColor: newActive() ? colors.accent : colors.border,
          }}
        >
          <Icon name="plus" size={16} tint={colors.text} />
          <Text class="text-sm font-semibold" style={{ color: colors.text }}>
            New chat
          </Text>
        </View>
      </Press>
      <Text class="text-xs font-semibold px-3 pb-1 pt-4" style={{ color: colors.faint }}>
        Conversations
      </Text>
      <Each of={conversations.filter((c) => c.id !== "new")} key={(row) => row.id}>
        {(row) => {
          const active = () => selectedId() === row().id;
          return (
            <Press
              onPress={() => openMain(row().id)}
              accessibilityLabel={row().label}
              accessibilityState={{ selected: active() }}
              hoverStyle={active() ? undefined : hovered()}
              style={{ borderRadius: radius.control }}
            >
              <View
                class="gap-0.5 px-3 py-2"
                style={{ backgroundColor: active() ? colors.raised : "transparent" }}
              >
                <Text
                  class="text-sm"
                  style={{
                    fontWeight: active() ? "600" : "400",
                    color: colors.text,
                  }}
                >
                  {row().label}
                </Text>
                <Text class="text-xs" style={{ color: colors.muted }}>
                  {row().detail}
                </Text>
              </View>
            </Press>
          );
        }}
      </Each>
    </View>
  );
}
