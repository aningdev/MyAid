// A press's feedback, native: a control sinks while pressed and eases back, from its
// `activeStyle`, so it never waits for JS.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { press } from "./theme";
import type { ViewStyle } from "nsh";
import { reduceMotion } from "nsh";

/** The easing of a press and of the state changes beside it: 150 ms, ease-out. */
export const pressEasing = {
  transitionDuration: 150,
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
export function pressSink(scale?: number, also?: string) {
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
