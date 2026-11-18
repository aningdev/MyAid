// A press's feedback, native: a control sinks while pressed and eases back, from its
// `activeStyle`, so it never waits for JS.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { press, terminal } from "./theme";
import type { ViewStyle } from "nsh";
import { platform, reduceMotion } from "nsh";

import { TOUCH_TARGET } from "./switch-geometry";

export { TOUCH_TARGET };

const pointer = platform.desktop;

/** How long a press's sink, and the state changes beside it, take to settle. */
const PRESS_MS = 150;

/** The easing of a press and of the state changes beside it: 150 ms, ease-out. */
const pressEasing = {
  transitionDuration: PRESS_MS,
  transitionTimingFunction: "ease-out",
} satisfies ViewStyle;

/** A `style`'s transition for a press's sink: `transform`, and `also` (more
 * of CSS's property names the control's states change, as
 * `"background-color, opacity"`) alike, over `pressEasing`. */
export function pressTransition(also?: string): ViewStyle {
  return { transitionProperty: also ? `${also}, transform` : "transform", ...pressEasing };
}

/**
 * A press that sinks a control to `scale` (default: the theme's `press.scale`,
 * 97%; none with reduced motion). A theme that draws no press (`press.scale` of
 * 1, as shadcn's flat surfaces do) sinks nothing, whichever scale a control
 * asks for. Spread `activeStyle` into the control's `activeStyle` (after its
 * own pressed shade) and `transition` into its `style`
 * (`pressTransition(also)`).
 */
export function pressSink(
  scale?: number,
  also?: string,
): { readonly activeStyle: ViewStyle; transition: ViewStyle } {
  return {
    get activeStyle(): ViewStyle {
      if (reduceMotion()) return {};
      const sink = press.scale;
      if (sink >= 1) return {};
      return { transform: [{ scale: scale ?? sink }] };
    },
    transition: pressTransition(also),
  };
}
/**
 * How far presses count past a control `side` points tall (a button's height,
 * a toggle's side), so a finger gets `TOUCH_TARGET` points without the control
 * looking bigger: none with a pointer or a terminal, and none once `side` is
 * that big already.
 */
export function touchSlop(side: number): number | undefined {
  if (pointer || terminal || side >= TOUCH_TARGET) return undefined;
  return (TOUCH_TARGET - side) / 2;
}
