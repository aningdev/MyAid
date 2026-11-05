// Design tokens and finishes for MyAid UI atoms.
// Colors map onto NSH's shadcn `neutral` theme plus apps/client/theme.json.
import type { Tokens, ViewStyle } from "nsh";
import { token } from "nsh";
import { Easing } from "nsh";
import { colorScheme } from "nsh";

/** Whether the UI shows its dark palette (reactive: reading it subscribes). */
export const isDark = () => colorScheme() !== "light";

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
  /** Quieter than `muted` for captions. */
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
  /** Keyboard focus ring. */
  ring: string;
  /** Scrim behind menus and sheets. */
  overlay: string;
  /** Full-screen media viewer scrim. */
  viewer: string;
  /** Text and icons on `viewer`. */
  viewerForeground: string;
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
  faint: "faint",
  accent: "primary",
  accentFill: "primary",
  onAccent: "primary-foreground",
  light: "primary",
  onLight: "primary-foreground",
  track: "muted",
  knob: "card",
  code: "foreground",
  info: "info",
  warn: "warning",
  danger: "destructive",
  up: "success",
  down: "destructive",
  ring: "ring",
  overlay: "overlay",
  viewer: "viewer",
  viewerForeground: "viewer-foreground",
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

/** `token` at `percent` opacity. Highlight and shadow live in the theme, so a host theme restyles every finish. */
function mix(name: "highlight" | "shadow" | "popover" | "card" | "primary", percent: number) {
  return `color-mix(in srgb, ${token(name)} ${percent}%, transparent)`;
}

const shine = (percent: number) => mix("highlight", percent);
const shade = (percent: number) => mix("shadow", percent);

function primaryFinish(): Finish {
  return {
    backgroundImage: `linear-gradient(180deg, ${token("primary")} 0%, ${token("foreground")} 100%)`,
    boxShadow: `inset 0 1px 0 ${shine(24)}, 0 1px 1px ${shade(20)}, 0 8px 18px -8px ${shade(35)}`,
  };
}

/**
 * Depth shared by cards, controls, and popups. Colors are theme tokens;
 * the geometry of the shadow stays here because it is not a color role.
 */
export const finish = {
  get card(): Finish {
    return {
      backgroundImage: `linear-gradient(180deg, ${token("card")} 0%, ${token("secondary")} 100%)`,
      boxShadow: `inset 0 1px 0 ${shine(55)}, 0 12px 32px -18px ${shade(22)}`,
    };
  },
  get inset(): Finish {
    return { boxShadow: `inset 0 1px 2px ${shade(12)}` };
  },
  get field(): Finish {
    return { boxShadow: `inset 0 1px 2px ${shade(14)}` };
  },
  get raised(): Finish {
    return {
      backgroundImage: `linear-gradient(180deg, ${token("secondary")} 0%, ${token("muted")} 100%)`,
      boxShadow: `inset 0 1px 0 ${shine(40)}, 0 1px 1px ${shade(8)}, 0 6px 14px -7px ${shade(28)}`,
    };
  },
  get light(): Finish {
    return primaryFinish();
  },
  get accent(): Finish {
    return primaryFinish();
  },
  get track(): Finish {
    return { boxShadow: `inset 0 1px 2px ${shade(16)}` };
  },
  get knob(): Finish {
    return {
      boxShadow: `inset 0 1px 0 ${shine(70)}, 0 1px 4px ${shade(28)}`,
    };
  },
  get pill(): Finish {
    return {
      backgroundColor: token("card"),
      backgroundImage: `linear-gradient(180deg, ${token("card")} 0%, ${token("secondary")} 100%)`,
      boxShadow: `inset 0 1px 0 ${shine(40)}, 0 1px 1px ${shade(8)}, 0 6px 14px -7px ${shade(24)}`,
      borderColor: token("border"),
    };
  },
  get chip(): Finish {
    return { boxShadow: `inset 0 1px 0 ${shine(50)}, inset 0 -1px 0 ${shade(8)}` };
  },
  get glass(): Finish {
    return {
      backgroundColor: mix("popover", 70),
      backgroundImage: `linear-gradient(180deg, ${shine(18)} 0%, ${shine(6)} 60%)`,
      boxShadow: `inset 0 1px 0 ${shine(30)}, 0 -8px 24px ${shade(12)}`,
      borderColor: token("border"),
      backdropFilter: "blur(20px)",
    };
  },
  get menu(): Finish {
    return {
      backgroundColor: mix("popover", 84),
      backgroundImage: `linear-gradient(180deg, ${shine(16)} 0%, ${shine(6)} 100%)`,
      boxShadow: `inset 0 1px 0 ${shine(40)}, inset 0 -1px 0 ${shade(8)}, 0 12px 32px ${shade(16)}`,
      borderColor: token("border"),
      backdropFilter: "blur(24px)",
    };
  },
};

/** Type scale from the theme, in points. Use `text-xs` … `text-xl` on `Text`; use these where a style object cannot take a class (`TextView` parts). */
export const font = {
  get xs() {
    return Number(token("font-xs"));
  },
  get sm() {
    return Number(token("font-sm"));
  },
  get base() {
    return Number(token("font-base"));
  },
  get lg() {
    return Number(token("font-lg"));
  },
  get xl() {
    return Number(token("font-xl"));
  },
};

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
  outlineColor: colors.ring,
  outlineOffset: offset,
});
