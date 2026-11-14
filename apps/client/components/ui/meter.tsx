// A thin horizontal meter with an optional marker. From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors, terminal, TERMINAL_ROW, toneColor, type Tone } from "../../lib/theme";
import { View } from "nsh";

import { progressFill, progressGlide, progressRail, progressRemaining } from "./progress";

/** A value, or a function reading it where the meter is drawn (a signal). */
type Live<T> = T | (() => T);

const read = <T,>(v: Live<T> | undefined): T | undefined =>
  typeof v === "function" ? (v as () => T)() : v;

/** A horizontal meter with an optional marker (a limit), `value` from 0
 * to 1: a progress bar's rail and fill (`look/meter.ts`), the fill gliding
 * to each new value; half a row in the terminal, so its fill is a solid bar
 * rather than a rule. */
export function Meter(props: {
  value: number;
  /** The fill's tone: the citrus run by default (`accent` is the run too); a function is read where the bar is drawn. */
  tone?: Tone | (() => Tone);
  marker?: number;
}) {
  /** The fill's tone, read where the fill is drawn. */
  const tone = () => read(props.tone);
  /** The terminal's solid fill: a tone's color, or the citrus run's (`accent` and no tone alike). */
  const toneFill = () => {
    const color = tone();
    return color && color !== "accent" ? toneColor(color) : colors.accentFill;
  };
  return (
    // The marker stands past the rail, which clips its fill: they sit side
    // by side in a view of the rail's height.
    <View style={{ height: terminal ? TERMINAL_ROW / 2 : 6 }}>
      {terminal ? (
        <View style={{ height: TERMINAL_ROW / 2, backgroundColor: colors.track }}>
          <View
            style={{
              width: `${Math.max(0, Math.min(1, props.value)) * 100}%`,
              height: TERMINAL_ROW / 2,
              backgroundColor: toneFill(),
            }}
          />
        </View>
      ) : (
        <View style={progressRail(6)}>
          <View
            class={progressGlide}
            style={{
              ...progressFill(6, tone()),
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
