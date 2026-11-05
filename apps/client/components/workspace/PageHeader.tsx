import type { JSX } from "nsh";
import { Text, View } from "nsh";

import { colors, hovered, Icon, radius } from "../ui";

/** App-drawn page header (desktops / web NavPage `header` slot). */
export function WorkspacePageHeader(props: {
  title: string;
  root?: boolean;
  onBack?: () => void;
  trailing?: JSX.Element;
}) {
  const showBack = () => !props.root && !!props.onBack;
  return (
    <View
      desktop={{ windowDrag: true }}
      style={{
        height: 52,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <If when={showBack()}>
        <View
          onPress={props.onBack}
          role="button"
          accessibilityLabel="Back"
          hitSlop={6}
          hoverStyle={hovered()}
          style={{
            height: 32,
            flexDirection: "row",
            alignItems: "center",
            gap: 2,
            paddingLeft: 4,
            paddingRight: 10,
            borderRadius: radius.control,
            cursor: "pointer",
          }}
        >
          <Icon name="back" size={18} tint={colors.accent} />
          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.accent }}>Back</Text>
        </View>
      </If>
      <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: colors.text }}>
        {props.title}
      </Text>
      {props.trailing}
    </View>
  );
}
