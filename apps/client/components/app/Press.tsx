/**
 * A bare pressable in the theme's press (shadcn-nsh keeps a press's feedback
 * in `lib/press`, not a component): for a target that carries no look of its
 * own — a whole row, an image, a chip's text — where a `Button` would add a
 * fill and a height of its own. The press data is `lib/press`'s, so it sinks
 * natively and stands still with reduced motion; the focus ring is the
 * theme's.
 */
import type { JSX, ViewStyle } from "nsh";
import { Button as BaseButton } from "nsh/base";

import { pressSink } from "../../lib/press";
import { focusRing } from "../../lib/theme";

export type PressProps = {
  testID?: string;
  onPress?: () => void;
  disabled?: boolean;
  /** How far it sinks (default 0.97). None with reduced motion. */
  scale?: number;
  style?: ViewStyle;
  class?: string;
  hoverStyle?: ViewStyle;
  role?: "button" | "tab" | "switch" | "link";
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
  hitSlop?: number;
  tooltip?: JSX.Element;
  children: JSX.Element;
};

export function Press(props: PressProps) {
  const sink = pressSink(props.scale);
  return (
    <BaseButton
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled || props.accessibilityState?.disabled}
      selected={props.accessibilityState?.selected}
      role={props.role ?? "button"}
      accessibilityLabel={props.accessibilityLabel}
      hitSlop={props.hitSlop}
      tooltip={props.tooltip}
      class={props.class}
      hoverStyle={props.hoverStyle}
      focusVisibleStyle={focusRing()}
      disabledStyle={{ opacity: 0.4 }}
      style={[{ minWidth: 44, minHeight: 44 }, props.style ?? null, sink.transition]}
      activeStyle={sink.activeStyle}
    >
      {props.children}
    </BaseButton>
  );
}
