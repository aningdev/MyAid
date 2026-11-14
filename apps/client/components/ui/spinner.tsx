// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { alpha } from "../../lib/theme";
import { reduceMotion, View } from "nsh";

/** A ring turning with its top arc in `tint`: work going on. It stands still
 * when the user asks for less motion. */
export function Spinner(props: { size: number; tint: string }) {
  return (
    <View
      style={{
        width: props.size,
        height: props.size,
        borderRadius: props.size / 2,
        borderWidth: Math.max(1.5, props.size / 8),
        borderColor: alpha(props.tint, 0.25),
        borderTopColor: props.tint,
        animationName: reduceMotion() ? undefined : "spin",
        animationDuration: 800,
        animationTimingFunction: "linear",
        animationIterationCount: "infinite",
      }}
    />
  );
}
