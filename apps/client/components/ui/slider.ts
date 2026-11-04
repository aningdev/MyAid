import type { TextStyle, ViewStyle } from "nsh";
import { platform } from "nsh";
import { alpha, colors } from "./theme";

/** Options of `sliderLook`. */
export interface SliderLookOptions {
  /** A vertical slider: the rail 8 wide, the thumb 8 × 16. */
  vertical?: boolean;
  /** The value column after the track (`children`: a 42-point label). */
  value?: boolean;
}

/** The value column's label class. */
export const sliderValueClass = "w-[42px] text-right font-mono text-[11px] leading-none";

/** The value column label's color. */
export const sliderValueStyle = (): TextStyle => ({ color: alpha(colors.text, 0.6) });

/**
 * A `Slider`'s parts (spread them: `<Slider {...sliderLook()}>`).
 * Classes use NSH default theme tokens (`muted`, `primary`, `card`).
 */
export function sliderLook(o: SliderLookOptions = {}) {
  const vertical = !!o.vertical;
  const pointer = platform.idiom === "desktop";
  const rail = `${vertical ? "w-2" : "h-2"} rounded-full bg-muted`;
  const focus = "focus-within:ring-2 focus-within:ring-primary/36 focus-within:ring-offset-2 focus-within:ring-offset-card";
  const fade = "transition duration-150 motion-reduce:transition-none";
  const railStyle = (): ViewStyle => ({
    boxShadow: `inset 0 1px 1px rgba(255, 255, 255, 0.04), 0 0 14px ${alpha(colors.accent, 0.06)}`,
  });
  const track = pointer ? `${rail} ${vertical ? "h-32 py-2" : "px-2"} ${focus}` : vertical ? "w-8 h-36 items-center" : "h-8 justify-center";
  return {
    class: o.value ? "flex-row items-center gap-2" : undefined,
    trackClass: `${track} ${o.value ? "flex-1" : ""} cursor-pointer ${fade} disabled:opacity-35 disabled:cursor-not-allowed`,
    get trackStyle(): ViewStyle | undefined {
      return pointer ? railStyle() : undefined;
    },
    indicatorClass: pointer ? (vertical ? "flex-1" : "h-full") : `${rail} ${vertical ? "h-full" : ""} ${focus}`,
    get indicatorStyle(): ViewStyle | undefined {
      return pointer ? undefined : railStyle();
    },
    rangeClass: `rounded-full ${pointer ? (vertical ? "-mb-2" : "-ml-2") : ""}`,
    thumbClass: `${vertical ? "w-2 h-4" : "w-4 h-2"} rounded-full ${fade} hover:brightness-110 active:brightness-125 focus:outline-none disabled:brightness-100`,
    get thumbStyle(): ViewStyle {
      return {
        backgroundColor: colors.faint,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 0 0 1px rgba(0, 0, 0, 0.42)",
      };
    },
  };
}

/**
 * A `Slider`'s fill (`rangeStyle`): the accent deepening toward the fill's
 * start and fading into the thumb's tone at the thumb.
 */
export function sliderFill(from: number, to: number, vertical = false): ViewStyle {
  const length = Math.max(to - from, 0);
  const accentAt = length > 0 ? (Math.max(length - 0.14, 0) / length) * 100 : 0;
  const deep = `color-mix(in oklab, ${colors.accent} 80%, black)`;
  return {
    backgroundImage: `linear-gradient(${vertical ? 0 : 90}deg, ${deep} 0%, ${colors.accent} ${accentAt}%, ${colors.faint} 100%)`,
  };
}
