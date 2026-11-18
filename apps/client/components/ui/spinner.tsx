// A spinner: a ring turning with its top arc in one color, the shape of work going on.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { alpha } from "../../lib/theme";
import { reduceMotion, View } from "nsh";

/** One turn, in milliseconds: fast enough to read as work going on, slow enough not to blur. */
const TURN_MS = 800;

/** The ring's thinnest line, in points, and what its thickness is of its side. */
const MIN_STROKE = 1.5;
const STROKE_SHARE = 8;

/** How much of `tint` the ring's still part keeps: a quarter, so the moving arc leads. */
const TRACK_ALPHA = 0.25;

/** A spinner's props. */
export interface SpinnerProps {
  /** The ring's side, in points. */
  size: number;
  /** The moving arc's color (the theme's text, a tone); the rest of the ring is it at a quarter. */
  tint: string;
}

/**
 * A ring turning with its top arc in `tint`: work going on. It stands still
 * when the user asks for less motion.
 */
export function Spinner(props: SpinnerProps) {
  const stroke = Math.max(MIN_STROKE, props.size / STROKE_SHARE);
  return (
    <View
      style={{
        width: props.size,
        height: props.size,
        borderRadius: props.size / 2,
        borderWidth: stroke,
        borderColor: alpha(props.tint, TRACK_ALPHA),
        borderTopColor: props.tint,
        animationName: reduceMotion() ? undefined : "spin",
        animationDuration: TURN_MS,
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
      }}
    />
  );
}
