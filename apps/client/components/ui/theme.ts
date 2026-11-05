// Design tokens and finishes for MyAid UI atoms.
// Colors map onto NSH's built-in shadcn `neutral` theme (no custom theme.json).
import type { Tokens, ViewStyle } from "nsh";
import { token } from "nsh";
import { Easing } from "nsh";
import { colorScheme } from "nsh";

import finishes from "./finishes.json";

/** Whether the UI shows its dark palette (reactive: reading it subscribes). */
export const isDark = () => colorScheme() !== "light";

/**
 * An object with `dark`'s keys whose getters read `dark` or `light` by the
 * appearance shown. Shadows and gradients are not design tokens, so they
 * stay here while every color comes from the theme.
 */
function themed<T extends object>(dark: T, light: T): T {
  const out = {} as T;
  for (const key of Object.keys(dark) as (keyof T)[]) {
    Object.defineProperty(out, key, {
      enumerable: true,
      get: () => (isDark() ? dark : light)[key],
    });
  }
  return out;
}

/** The roles of the palette. */
export interface Palette {
  /** The page behind the cards. */
  background: string;
  /** A card. */
  surface: string;
  /** A surface inside a card. */
  inset: string;
  /** A control on a card (buttons, fields, tracks). */
  raised: string;
  /** An input's well. */
  field: string;
  /** An input's edge. */
  fieldBorder: string;
  border: string;
  /** Hairlines inside insets. */
  line: string;
  text: string;
  muted: string;
  faint: string;
  /** The accent as a foreground: text, icons, lines, small marks. */
  accent: string;
  /** The accent as a fill (buttons, bubbles), with `onAccent` on it. */
  accentFill: string;
  /** Text on the accent fill. */
  onAccent: string;
  /** The main action's button fill. */
  light: string;
  /** Text on `light`. */
  onLight: string;
  /** A switch's track when off. */
  track: string;
  /** A switch's knob when off. */
  knob: string;
  /** Code inside insets. */
  code: string;
  info: string;
  warn: string;
  danger: string;
  up: string;
  down: string;
}

/** An object whose getters read the theme's tokens. */
function tokens<K extends string>(names: Record<K, keyof Tokens>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(names) as K[]) {
    Object.defineProperty(out, key, { enumerable: true, get: () => token(names[key]) });
  }
  return out;
}

/**
 * Palette roles mapped onto NSH's default shadcn `neutral` tokens.
 * Structural roles (inset / raised / field / …) reuse muted / secondary /
 * input / card rather than gallery-only extensions.
 */
export const colors: Palette = tokens<keyof Palette>({
  background: "background",
  surface: "card",
  inset: "muted",
  raised: "secondary",
  field: "input",
  fieldBorder: "input",
  border: "border",
  line: "border",
  text: "foreground",
  muted: "muted-foreground",
  faint: "muted-foreground",
  accent: "primary",
  accentFill: "primary",
  onAccent: "primary-foreground",
  light: "primary",
  onLight: "primary-foreground",
  track: "muted",
  knob: "card",
  code: "muted",
  info: "chart-2",
  warn: "chart-3",
  danger: "destructive",
  up: "chart-4",
  down: "destructive",
});

/** `color` at opacity `a`. */
export function alpha(color: string, a: number) {
  return `color-mix(in srgb, ${color} ${a * 100}%, transparent)`;
}

export type Tone = "neutral" | "accent" | "info" | "warn" | "danger" | "up" | "down";

/** The color of a tone. */
export const toneColor = (tone: Tone) => (tone === "neutral" ? colors.muted : colors[tone]);
/** The tint of a tone (derived from the tone color; no custom tint tokens). */
export const toneTint = (tone: Tone) =>
  tone === "neutral" ? colors.raised : alpha(toneColor(tone), 0.12);

/** Translucent tints of the tones, for fills behind text. */
export const tints = {
  get accent() {
    return toneTint("accent");
  },
  get info() {
    return toneTint("info");
  },
  get warn() {
    return toneTint("warn");
  },
  get danger() {
    return toneTint("danger");
  },
  get up() {
    return toneTint("up");
  },
  get down() {
    return toneTint("down");
  },
};

/** A surface's finish: a gradient over its color and its shadows. */
export interface Finish {
  backgroundColor?: string;
  backgroundImage?: string;
  boxShadow: string;
  borderColor?: string;
  backdropFilter?: string;
}

/** Light and depth finishes (neutral, matching the default theme). */
export const finish = themed<
  Record<
    | "card"
    | "inset"
    | "field"
    | "raised"
    | "light"
    | "accent"
    | "track"
    | "knob"
    | "pill"
    | "chip"
    | "glass"
    | "menu",
    Finish
  >
>(finishes.dark, finishes.light);

/** The monospaced family, for code. */
export const mono = "monospace";

/** Corner radii derived from the default theme's single `radius` token. */
export const radius = {
  get card() {
    return Number(token("radius")) * 1.6;
  },
  get inset() {
    return Number(token("radius"));
  },
  get control() {
    return Number(token("radius"));
  },
};

/** The system header's colors on every page (iOS, Android). */
export const header = {
  get headerStyle() {
    return { backgroundColor: colors.background, color: colors.text, tintColor: colors.accent };
  },
};

/** The motion every control shares: quick, slightly springy. */
export const motion = {
  press: { stiffness: 520, damping: 34 },
  settle: { stiffness: 320, damping: 30 },
  enter: { duration: 420, easing: Easing.out(Easing.cubic) },
} as const;

/** A pressable under the pointer (`hoverStyle`). */
export const hovered = (): ViewStyle => ({ backgroundColor: alpha(colors.text, 0.05) });

/** The keyboard focus ring (`focusStyle`). */
export const focusRing = (offset = -2): ViewStyle => ({
  outlineStyle: "solid",
  outlineWidth: 2,
  outlineColor: colors.info,
  outlineOffset: offset,
});
