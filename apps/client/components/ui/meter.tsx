// A thin horizontal meter with an optional marker: the `Meter`, on progress's rail and fill.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors, terminal, TERMINAL_ROW, toneColor, type Tone } from "../../lib/theme";
import { View } from "nsh";

import { type Live, read } from "../../lib/utils";
import { progressFill, progressGlide, progressRail, progressRemaining } from "./progress";


/** The props of `Meter`. */
export type MeterProps = {
  /** How full the bar is, 0 to 1 (clamped). */
  value: number;
  /** The fill's tone: the citrus run by default (`accent` is the run too); a function is read where the bar is drawn. */
  tone?: Live<Tone>;
  /** Where the limit stands, 0 to 1; a hairline past the rail, and a bar of its own in the terminal. */
  marker?: number;
};

/** A horizontal meter with an optional marker (a limit), `value` from 0
 * to 1: a progress bar's rail and fill (`look/meter.ts`), the fill gliding
 * to each new value; half a row in the terminal, so its fill is a solid bar
 * rather than a rule. */
export function Meter(props: MeterProps) {
  /** The fill's tone, read where the fill is drawn. */
  const tone = () => read(props.tone);
  /** The terminal's solid fill: a tone's color, or the citrus run's (`accent` and no tone alike). */
  const toneFill = () => {
    const color = tone();
    return color && color !== "accent" ? toneColor(color) : colors.accentFill;
  };
  // 6 points on screen; in the terminal half a row, so the fill reads as a solid bar.
  const height = terminal ? TERMINAL_ROW / 2 : 6;
  return (
    // The marker stands past the rail, which clips its fill: they sit side
    // by side in a view of the rail's height.
    <View style={{ height }}>
      {terminal ? (
        <View style={{ height, backgroundColor: colors.track }}>
          <View
            style={{
              width: `${Math.max(0, Math.min(1, props.value)) * 100}%`,
              height,
              backgroundColor: toneFill(),
            }}
          />
        </View>
      ) : (
        <View style={progressRail(height)}>
          <View
            class={progressGlide}
            style={{
              ...progressFill(height, tone()),
              translate: progressRemaining(props.value * 100),
            }}
          />
        </View>
      )}
      <If when={props.marker !== undefined}>
        <View
          style={{
            position: "absolute",
            left: `${(props.marker ?? 0) * 100}%`,
            // A 2 × 12 hairline, standing past the rail on both sides.
            top: -4,
            width: 2,
            height: 12,
            borderRadius: 1,
            backgroundColor: colors.text,
          }}
        />
      </If>
    </View>
  );
}
