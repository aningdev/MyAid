// A switch: the look (`switchLook`) and the `Switch` that wears it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import {
  colors,
  finish,
  follow,
  motion,
  terminal,
  TERMINAL_COLUMN,
  TERMINAL_ROW,
} from "../../lib/theme";
import type { ViewStyle } from "nsh";
import { platform, split } from "nsh";
import { Switch as BaseSwitch, type SwitchProps as BaseSwitchProps } from "nsh/base";

import {
  knobTravel,
  type SwitchGeometry,
  switchGeometries,
  switchSlop,
} from "../../lib/switch-geometry";

/** A switch's size on a touch screen (`sm` 34 × 20); with a pointer both are 28 × 16. */
export type SwitchSize = "sm" | "default";

/** The props `switchLook` gives a `Switch`. */
export interface SwitchLook {
  /** Mirrors the track right to left, so the knob rests at the start there. */
  readonly trackClass: string;
  readonly trackStyle: ViewStyle;
  readonly thumbStyle: ViewStyle;
}

const pointer = platform.desktop;

/** The track and knob of a size, here (a pointer, a touch screen, the terminal). */
function geometry(size: SwitchSize): SwitchGeometry {
  if (terminal)
    return {
      width: 5 * TERMINAL_COLUMN,
      height: TERMINAL_ROW,
      border: 1,
      inset: 0,
      knob: TERMINAL_ROW,
    };
  return pointer ? switchGeometries.pointer : switchGeometries[size];
}

/**
 * The gallery's switch, as the props of `Switch`'s parts (spread them:
 * `<Switch {...switchLook(() => on())}>`): a track sunk into the surface
 * that turns citrus, and a knob that springs across, both natively. The
 * knob keeps its size on and off; on, it is white with an olive edge
 * (`finish.knobOn`). `on` is the value the app owns: the knob follows it,
 * from a press or from elsewhere. 28 × 16 with a pointer; on a touch screen
 * 42 × 24 (`sm`: 34 × 20); the terminal's is one row, as wide as its
 * glyph (`[off]`). The knob is as far from the track's edge on as off
 * (`knobTravel`). Read the styles in JSX, so the appearance is followed.
 * A switch that stands alone takes `switchHitSlop` too; one that is a row
 * with its label is its own target.
 */
export function switchLook(on: () => boolean, size: SwitchSize = "default"): SwitchLook {
  const g = geometry(size);
  // The knob travels as gpui-kit's does (`spring_move`), the track's color
  // with it; with reduced motion both change in place.
  const t = follow(() => (on() ? 1 : 0), motion.move);
  const x = t.interpolate({ inputRange: [0, 1], outputRange: [0, knobTravel(g)] });
  return {
    // The knob sits at the track's physical left (`left`, which keeps its
    // side) and travels right; right to left the whole track is mirrored, so
    // it rests at the start and springs toward the end in either direction.
    trackClass: "rtl:-scale-x-100",
    get trackStyle(): ViewStyle {
      return {
        width: g.width,
        height: g.height,
        borderRadius: g.height / 2,
        padding: g.inset,
        backgroundColor: t.interpolate({
          inputRange: [0, 1],
          outputRange: [colors.track, colors.accentFill],
        }),
        borderWidth: g.border,
        borderColor: on() ? finish.fill.borderColor : finish.track.borderColor,
        boxShadow: on() ? finish.fill.boxShadow : finish.track.boxShadow,
        transitionProperty: "border-color, box-shadow",
        transitionDuration: 150,
      };
    },
    get thumbStyle(): ViewStyle {
      return {
        position: "absolute",
        left: g.inset,
        top: g.inset,
        width: g.knob,
        height: g.knob,
        borderRadius: g.knob / 2,
        borderWidth: 1,
        ...(on() ? finish.knobOn : finish.knob),
        transform: [{ translateX: x }],
      };
    },
  };
}

/**
 * The hit slop of a switch that stands alone (its track is all of it), so
 * a finger gets 44 points without the track looking bigger: none with a
 * pointer or in the terminal. Leave it off a switch that is a row with its
 * label: the row is the target, and a slop would reach into the rows next
 * to it, which take presses before it where they overlap.
 */
export function switchHitSlop(
  size: SwitchSize = "default",
): { top: number; bottom: number; left: number; right: number } | undefined {
  return pointer || terminal ? undefined : switchSlop(geometry(size));
}

/**
 * `nsh/base`'s Switch in the look of `switchLook`. Every base prop passes through; `trackClass`,
 * `trackStyle` and `thumbStyle` go over the look's.
 */
export type SwitchProps = BaseSwitchProps & {
  /** Its size on a touch screen (default `default`); read once, as `switchLook` does. */
  size?: SwitchSize;
};

/**
 * A switch. Alone (no children) it takes `switchHitSlop`, so a finger gets 44 points; with
 * children it is a row with its label, and the row is the target.
 */
export function Switch(props: SwitchProps) {
  const [, rest] = split(props, ["size", "trackClass", "trackStyle", "thumbStyle", "hitSlop"]);
  const size = props.size ?? "default";
  const look = switchLook(() => props.checked ?? false, size);
  return (
    <BaseSwitch
      {...rest}
      hitSlop={props.hitSlop ?? (props.children == null ? switchHitSlop(size) : undefined)}
      trackClass={props.trackClass ? `${look.trackClass} ${props.trackClass}` : look.trackClass}
      trackStyle={[look.trackStyle, props.trackStyle ?? null]}
      thumbStyle={[look.thumbStyle, props.thumbStyle ?? null]}
    />
  );
}
