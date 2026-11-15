// A progress: the look (`progressLook` and its companions) and the `Progress` that wears it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors, fillStyle, finish, insetEdge, type Tone, toneColor } from "../../lib/theme";
import type { AnimatedValue, ViewStyle } from "nsh";
import { cleanup, createAnimatedValue, Easing, effect, reduceMotion, split } from "nsh";
import { Progress as BaseProgress, type ProgressProps as BaseProgressProps } from "nsh/base";

/** A value, or a function reading it where the look is applied (a signal). */
type Live<T> = T | (() => T);

const read = <T,>(v: Live<T> | undefined): T | undefined =>
  typeof v === "function" ? (v as () => T)() : v;

/**
 * A determinate fill's classes: the whole track's width, slid back by what
 * is left to do (`progressRemaining`), so a new value glides there on
 * gpui-kit's 180 ms `easing_move` curve (and a new tone fades in); the track
 * clips it. At once with reduced motion.
 */
export const progressGlide =
  "w-full transition duration-180 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none";

/** A determinate fill's `translate` for `value` percent (0 to 100). */
export const progressRemaining = (value: number) => `${Math.max(0, Math.min(100, value)) - 100}% 0`;

/** A bar's rail, `height` points tall (default 6): the slider's sunk track,
 * its edge drawn inside so the fill keeps the whole height, clipping the
 * fill. */
export function progressRail(height = 6): ViewStyle {
  return {
    height,
    borderRadius: height / 2,
    overflow: "hidden",
    backgroundColor: colors.track,
    boxShadow: insetEdge(finish.track.borderColor, finish.track.boxShadow),
  };
}

/** A bar's fill, `height` points tall (default 6): the slider's citrus run
 * (`finish.fill`: one color, under its gradient where the theme gives one), or a tone's color
 * (`up` for done, `warn`, `danger`; `accent` is the run). Neither has an edge, so a tone's bar and
 * the run read as one kind of bar. */
export function progressFill(height = 6, tone?: Tone): ViewStyle {
  return tone && tone !== "accent"
    ? { height, borderRadius: height / 2, backgroundColor: toneColor(tone) }
    : { height, borderRadius: height / 2, ...fillStyle() };
}

/** An indeterminate bar's sweep (`progressSweep()`), for `progressLook`'s `sweep`. */
export interface ProgressSweep {
  /** Spread on the `Progress` (its `onLayout`): its width is the track's,
   * so keep its padding on a view around it. */
  onLayout: (event: { bounds: { size: { width: number } } }) => void;
  /** Where the sweep is, 0 to 1, times `travel`. */
  readonly sweep: AnimatedValue;
  /** Two thirds of the track: how far the third that sweeps crosses. */
  readonly travel: AnimatedValue;
}

/**
 * The sweep of indeterminate bars: a third of the track crossing it and
 * back every 800 ms, eased in and out, looped natively, so no JS runs per
 * crossing; it rests in the middle with reduced motion. Make one in a
 * component (it stops with it) and pass it to the `progressLook` of every
 * bar that may be indeterminate; spread its `onLayout` on one of them.
 */
export function progressSweep(): ProgressSweep {
  const sweep = createAnimatedValue(0);
  const travel = createAnimatedValue(0);
  effect(() => {
    if (reduceMotion()) sweep.set(0.5);
    else
      sweep.keyframes([0, 1], {
        duration: 800,
        easing: Easing.bezier(0.42, 0, 0.58, 1),
        iterations: "infinite",
        direction: "alternate",
      });
  });
  cleanup(() => void sweep.stop());
  return {
    onLayout: ({ bounds }) => travel.set((bounds.size.width * 2) / 3),
    sweep,
    travel,
  };
}

/** Options of `progressLook`. */
export interface ProgressLookOptions {
  /** The rail's and the fill's height, default 6 (4 for a thin bar under a row). */
  height?: number;
  /** The fill's tone: the citrus run by default, `up` once done. */
  tone?: Live<Tone | undefined>;
  /** The bar has no value yet (pass the same to the `Progress`'s `indeterminate`). */
  indeterminate?: Live<boolean | undefined>;
  /** The sweep an indeterminate bar's third follows. */
  sweep?: ProgressSweep;
}

/**
 * A `Progress`'s parts (spread them: `<Progress value={v()} {...progressLook(() => v())}>`):
 * the rail (`progressRail`), and a fill (`progressFill`) that glides to each
 * new value (`progressGlide`), or, indeterminate, a third of the track
 * following `sweep`.
 */
export function progressLook(value: Live<number>, o?: ProgressLookOptions) {
  const height = o?.height ?? 6;
  const indeterminate = () => !!read(o?.indeterminate);
  return {
    get trackStyle(): ViewStyle {
      return progressRail(height);
    },
    get indicatorClass(): string {
      return indeterminate() ? "w-1/3" : progressGlide;
    },
    get indicatorStyle(): ViewStyle {
      const fill = progressFill(height, read(o?.tone));
      if (!indeterminate()) return { ...fill, translate: progressRemaining(read(value) ?? 0) };
      return o?.sweep
        ? { ...fill, transform: [{ translateX: o.sweep.sweep.mul(o.sweep.travel) }] }
        : { ...fill, translate: "100% 0" };
    },
  };
}

/**
 * `nsh/base`'s Progress with `progressLook`. Every base prop passes through; track / indicator
 * styles go over the look's.
 */
export type ProgressProps = BaseProgressProps & {
  /** Rail and fill height (default 6). */
  height?: number;
  /** Fill tone; default citrus run. A function is read where the fill is drawn. */
  tone?: Tone | (() => Tone);
  /** Shared sweep for indeterminate bars. */
  sweep?: ProgressSweep;
};

/** A progress bar on the shared meter rail. */
export function Progress(props: ProgressProps) {
  const [, rest] = split(props, [
    "height",
    "tone",
    "sweep",
    "value",
    "indeterminate",
    "trackStyle",
    "indicatorClass",
    "indicatorStyle",
    "onLayout",
  ]);
  const look = progressLook(() => props.value ?? 0, {
    height: props.height,
    tone: () => read(props.tone),
    indeterminate: () => props.indeterminate,
    sweep: props.sweep,
  });
  return (
    <BaseProgress
      {...rest}
      value={props.value}
      indeterminate={props.indeterminate}
      onLayout={props.onLayout ?? props.sweep?.onLayout}
      trackStyle={[look.trackStyle, props.trackStyle ?? null]}
      indicatorClass={props.indicatorClass ?? look.indicatorClass}
      indicatorStyle={[look.indicatorStyle, props.indicatorStyle ?? null]}
    />
  );
}
