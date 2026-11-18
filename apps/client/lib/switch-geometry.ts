// A switch's sizes and the arithmetic of its knob, apart from `switch.tsx` and free of imports: kept
// in lib so `bun test` checks it without starting NSH.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.

/** A switch's track and knob, in points. */
export interface SwitchGeometry {
  /** The track's outer width. */
  width: number;
  /** The track's outer height. */
  height: number;
  /** The track's border, on every side. */
  border: number;
  /** The track's padding, between its border and the knob, on every side. */
  inset: number;
  /** The knob's diameter. */
  knob: number;
}

/**
 * The switch's sizes, by name: `pointer` is a mouse's 28 × 16, `default` a touch screen's
 * 42 × 24 and `sm` its smaller 34 × 20. The track is exactly the knob plus its border and inset
 * on each side, so the knob sits as far from the top and the bottom as from the near end.
 */
export const switchGeometries = {
  pointer: { width: 28, height: 16, border: 1, inset: 1, knob: 12 },
  default: { width: 42, height: 24, border: 1, inset: 1, knob: 20 },
  sm: { width: 34, height: 20, border: 1, inset: 1, knob: 16 },
} satisfies Record<string, SwitchGeometry>;

/**
 * How far the knob travels from off to on. Off, it rests at the start of the
 * track's content box, `border + inset` from the leading edge; on, it must
 * end the same `border + inset` from the trailing edge. So it travels the
 * width less the knob and that gap at both ends.
 */
export const knobTravel = (g: SwitchGeometry): number =>
  g.width - 2 * (g.border + g.inset) - g.knob;

/** The smallest target a finger gets (Design Guides, "Touch targets"). */
export const TOUCH_TARGET = 44;

/**
 * How far presses count past a switch whose track makes up its height, so a
 * finger gets `TOUCH_TARGET` points on each axis without the track looking
 * bigger.
 */
export function switchSlop(g: SwitchGeometry): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const v = Math.max(0, (TOUCH_TARGET - g.height) / 2);
  const h = Math.max(0, (TOUCH_TARGET - g.width) / 2);
  return { top: v, bottom: v, left: h, right: h };
}
