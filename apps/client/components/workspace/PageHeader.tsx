import type { JSX } from "nsh";
import { Text, View } from "nsh";

import { colors, hovered, Icon, Press, radius } from "../ui";

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
      class="min-h-12 flex-row items-center gap-2 px-3"
      desktop={{ windowDrag: true }}
      style={{
        backgroundColor: colors.background,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <If when={showBack()}>
        <Press
          onPress={props.onBack}
          accessibilityLabel="Back"
          hitSlop={6}
          hoverStyle={hovered()}
          class="ps-1 pe-2"
          style={{ borderRadius: radius.control }}
        >
          <View class="flex-row items-center gap-0.5">
            <Icon name="back" size={18} tint={colors.text} />
            <Text class="text-sm font-medium" style={{ color: colors.text }}>
              Back
            </Text>
          </View>
        </Press>
      </If>
      <Text class="text-lg font-semibold" style={{ flex: 1, color: colors.text }}>
        {props.title}
      </Text>
      {props.trailing}
    </View>
  );
}
