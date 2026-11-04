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
      >
        <View
          hoverStyle={newActive() ? undefined : hovered()}
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
            borderColor: newActive() ? colors.accent : colors.border,
            cursor: "pointer",
          }}
        >
          <Icon name="plus" size={15} tint={colors.text} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>New chat</Text>
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
        CONVERSATIONS
      </Text>
      <Each of={conversations.filter((c) => c.id !== "new")}>
        {(row) => {
          const active = () => selectedId() === row().id;
          return (
            <View
              onPress={() => openMain(row().id)}
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
    </View>
  );
}
