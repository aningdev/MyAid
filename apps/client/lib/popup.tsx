// The popup families' one surface and the motion they come in with: menus, popovers, a select's
// list, and the mark of a checkable menu item and the scrim behind what is modal.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { finish, radius, terminal } from "./theme";
import type { JSX, MotionSpec, StyleProp, ViewStyle } from "nsh";
import { createMotion, Easing, reduceMotion, token, View } from "nsh";

import { CheckMark } from "./icons";

/**
 * The scrim behind what is modal (a sheet, a dialog, a menu's sheet on a
 * touch screen): the theme's `scrim`, one dimming for every overlay. Pass
 * it as the overlay's `backdropStyle`.
 */
export function backdrop(): ViewStyle {
  return { backgroundColor: token("scrim") };
}

/** The side of its trigger a popup is on. */
export type PopupSide = "top" | "bottom" | "left" | "right";

/** How long a popup takes to come in, and how far it moves: shadcn/ui's popups' 150 ms and its
 * `zoom-in-95` (it starts at 96 % of its size). */
const ENTER_MS = 150;
const ENTER_SCALE = 0.96;

/** How far a popup slides out of its trigger's edge as it comes in, in points. */
const ENTER_DISTANCE = 4;

/** The dot of a choice in a menu, and the corners that make it round: 6 points across. */
const DOT = 6;

/**
 * The surface every anchored popup shares (menus, popovers, a select's
 * list): the floating tier, one edge, a soft shadow, the theme's `radius`
 * corners and 4 points around its rows (Design Guides, "Surfaces and
 * elevation"). A terminal shows it by its line alone: a box there is its
 * line or its fill.
 */
export function popupSurface(): ViewStyle {
  return (
    // A terminal draws a popup as its line alone, over no fill of its own.
    terminal
      ? {
          borderRadius: radius.inset,
          borderWidth: 1,
          padding: 4,
          borderColor: finish.menu.borderColor,
        }
      : { borderRadius: radius.inset, borderWidth: 1, padding: 4, ...finish.menu }
  );
}

/** Where a popup grows from: the edge that faces its trigger. */
const origins: Record<PopupSide, string> = {
  bottom: "top",
  top: "bottom",
  left: "right",
  right: "left",
};

/**
 * How a popup comes in, as shadcn/ui's popups do (`fade-in-0 zoom-in-95
 * slide-in-from-*`): it fades up from nothing, grows from 96 % and slides
 * the last `distance` points out of its trigger's edge, decelerating into
 * place. Reduced motion lands it at once.
 */
export function popIn(side: PopupSide = "bottom", distance = ENTER_DISTANCE): MotionSpec {
  const away = side === "top" || side === "left" ? distance : -distance;
  const axis = side === "top" || side === "bottom" ? "translateY" : "translateX";
  return {
    duration: ENTER_MS,
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    keyframes: { opacity: [0, 1], scale: [ENTER_SCALE, 1], [axis]: [away, 0] },
  };
}

/**
 * `popIn` on a popup's own box, which `nsh/base` makes on each opening (a
 * `Menu`'s and its submenus', whose surface is that box so it stays put
 * around the items scrolling in it): `style` the transition and the edge
 * it grows from, `starting` its first frame's look (the popup's
 * `popupStartingStyle`), from which it fades up, grows from 96 % and
 * slides `distance` points out of the trigger's edge in 150 ms. Reduced
 * motion, and a terminal, land it at once: no transition, no first look.
 */
export function popInStyles(
  side: PopupSide = "bottom",
  distance = ENTER_DISTANCE,
): { style: ViewStyle; starting?: ViewStyle } {
  if (terminal || reduceMotion()) return { style: {} };
  const away = side === "top" || side === "left" ? distance : -distance;
  const slide = side === "top" || side === "bottom" ? { translateY: away } : { translateX: away };
  return {
    style: {
      transformOrigin: origins[side],
      transitionProperty: "opacity, transform",
      transitionDuration: ENTER_MS,
      transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
    starting: { opacity: 0, transform: [{ scale: ENTER_SCALE }, slide] },
  };
}

/**
 * A popup's surface that comes in with `popIn` each time it is made: the
 * content of a `Popover`, which makes it on every opening. The look is `class` and `style` (the popup's own box keeps
 * none, so the shadow stays in register with the moving panel); `side` is
 * the trigger's side it opens on.
 */
export function PopIn(props: {
  side?: PopupSide;
  class?: string;
  style?: StyleProp<ViewStyle>;
  children: JSX.Element;
}) {
  const m = createMotion({ enter: popIn(props.side) });
  return (
    <View
      class={props.class}
      style={[
        props.style ?? null,
        { transformOrigin: origins[props.side ?? "bottom"], ...m.style },
      ]}
    >
      {props.children}
    </View>
  );
}

/** The indicator part a `MenuMark` goes in: a `group` whose `group-checked:` classes the mark's
 * follow (give the item `indicatorClass={menuIndicator}`). */
export const menuIndicator = "group";

/**
 * The mark of a checkable menu item, its `indicator`: a check (a setting)
 * or a dot (one choice of a group) in a box before the label, so the labels
 * of a menu stay in line. It shows the value through the indicator part
 * around it, which takes the item's state: give the item
 * `indicatorClass={menuIndicator}` (`group`), and the mark's `group-checked:`
 * classes follow the item. It fades and grows in from 75 % in
 * 150 ms as the item is checked and goes the same way, so moving a group's
 * choice crosses over from one item to the next. Reduced motion shows it at
 * once.
 */
export function MenuMark(props: { kind?: "check" | "dot"; tint: string; size?: number }) {
  const size = () => props.size ?? 16;
  return (
    <View
      class="scale-75 items-center justify-center opacity-0 transition duration-150 ease-out group-checked:scale-100 group-checked:opacity-100 motion-reduce:transition-none"
      style={{ width: size(), height: size() }}
    >
      {props.kind === "dot" ? (
        <View
          style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: props.tint }}
        />
      ) : (
        <CheckMark size={size() - 2} weight={2.7} tint={props.tint} />
      )}
    </View>
  );
}
