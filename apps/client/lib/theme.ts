// The theme's roles, finishes, radii, focus and motion, read from `theme.json` and `finishes.json`.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import type { AnimatedValue, Theme, Tokens, ViewStyle } from "nsh";
import {
  colorScheme,
  createAnimatedValue,
  Easing,
  effect,
  platform,
  reduceMotion,
  setTheme,
  signal,
  token,
} from "nsh";

import finishes from "./finishes.json";

/**
 * The Terminal idiom: the shared UI and the gallery leave out what a
 * terminal program would not show (charts, sparklines, decorative icons and
 * art, window chrome), put on one row what other platforms stack, and space
 * in whole Cell rows (16 pt at the default 8 × 16 points per Cell).
 */
export const terminal = platform.idiom === "terminal";

/** One Cell row and one Cell column in points (the default 8 × 16 points
 * per Cell): the terminal's line height and its unit of spacing. */
export const TERMINAL_ROW = 16;

export const TERMINAL_COLUMN = 8;

/** The gap the terminal's layout makes two columns (it makes any smaller
 * gap one): between neighbours that are words, such as icon buttons shown
 * as their labels, so they read apart. */
export const TERMINAL_GAP = 24;

/** A vertical space (a gap, a padding) in the terminal's whole rows: none
 * below half a row, else the nearest whole number of rows. Unchanged
 * elsewhere. */
export const wholeRows = (points: number) =>
  terminal ? Math.round(points / TERMINAL_ROW) * TERMINAL_ROW : points;

/** Whether the shared example UI shows its dark palette (reactive: reading it subscribes). */
export const isDark = () => colorScheme() !== "light";

/** A surface's finish: a gradient over its color and its shadows. */
export interface Finish {
  backgroundColor?: string;
  backgroundImage?: string;
  boxShadow: string;
  borderColor?: string;
  backdropFilter?: string;
}

/** The finishes' roles: the keys of `finishes.json`'s two appearances. */
export type FinishRole =
  | "card"
  | "inset"
  | "field"
  | "raised"
  | "hover"
  | "pressed"
  | "light"
  | "accent"
  | "track"
  | "fill"
  | "knob"
  | "knobOn"
  | "pill"
  | "thumb"
  | "on"
  | "chip"
  | "glass"
  | "menu"
  | "groove";

/** What a theme's `finishes.json` holds: its finishes, one set per appearance. */
export interface Finishes {
  press: Press;
  dark: Record<FinishRole, Finish>;
  light: Record<FinishRole, Finish>;
}

/**
 * One theme an app can switch to while it runs (`selectTheme`): the id an
 * app stores to bring it back, the name a list of them shows, and the
 * content of the two files a theme is.
 */
export interface AppTheme {
  /** The id an app stores and compares: `"shadcn"`. */
  id: string;
  /** The name a list of themes shows: `"shadcn neutral"`. */
  label: string;
  /** `theme.json`'s content: the tokens `setTheme` takes. */
  theme: Theme;
  /** `finishes.json`'s content. */
  finishes: Finishes;
}

/** How far a press sinks a control in a theme, in both appearances. */
export interface Press {
  /**
   * The scale a pressed control lands on: `0.97` for the default theme, where a press is a small
   * sink; `1` for a theme whose surfaces are flat and draw no press of their own (shadcn's).
   */
  scale: number;
}

/** The build-time finishes: `finishes.json` beside this file (the app's `nsh-ui.json` names the theme they belong to). */
const builtIn: Finishes = finishes;

/** The theme `selectTheme` put in; `null` while the app shows its build-time one. */
const selected = signal<AppTheme | null>(null);

/** The finishes in use: the selected theme's, else the build-time ones. Reactive: reading it subscribes. */
const finishesOf = (): Finishes => selected()?.finishes ?? builtIn;

/**
 * Finishes a role may hold beyond the build-time file's keys. `fill` is the one: a theme may draw
 * its runs as a gradient (the build-time one) or as a single color with no gradient at all
 * (shadcn's flat fills), and a reader has to see the color the second kind states.
 */
const FINISH_EXTRA: Partial<Record<FinishRole, (keyof Finish)[]>> = {
  fill: ["backgroundColor"],
};

/**
 * An object whose getters read one finish role of the finishes in use, in
 * the appearance shown: shadows and gradients are no design tokens, so they
 * stay here while every color is the theme's. Reading one subscribes to the
 * appearance and to the theme `selectTheme` put in.
 */
function themed(role: FinishRole): Finish {
  const out = {} as Finish;
  const keys = [
    ...(Object.keys(builtIn.dark[role]) as (keyof Finish)[]),
    ...(FINISH_EXTRA[role] ?? []).filter((key) => !(key in builtIn.dark[role])),
  ];
  for (const key of keys) {
    Object.defineProperty(out, key, {
      enumerable: true,
      get: () => {
        const finishes = finishesOf();
        return (isDark() ? finishes.dark : finishes.light)[role][key];
      },
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
  /** A muted fill: a quiet block, the well a section's content sits in, on a page or on a card
   * (shadcn's `bg-muted`; `inset` is the surface's own shade, which in a dark appearance is all but
   * the card's). */
  mutedFill: string;
  /** A control on a card (buttons, fields, tracks). */
  raised: string;
  /** An input's well: below the card and the insets it sits on. */
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
  /** The main action's fill (the theme's `primary`): the citrus, in both appearances. */
  light: string;
  /** Text on `light`. */
  onLight: string;
  /** The app's sidebar, beside the page. */
  sidebar: string;
  /** The selected row of the sidebar. */
  sidebarSelected: string;
  /** The sidebar's edge and the toolbar's hairline. */
  sidebarBorder: string;
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

/** An object whose getters read the theme's tokens: reads in a reactive
 * scope (JSX, a `draw`, an effect) follow the appearance and the theme. */
function tokens<K extends string>(names: Record<K, keyof Tokens>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const key of Object.keys(names) as K[]) {
    Object.defineProperty(out, key, { enumerable: true, get: () => token(names[key]) });
  }
  return out;
}

/**
 * The shared example UI's look: a graphite page (or a paper one in light
 * appearance), cards with an inset surface, tabular numbers and one citrus
 * accent, its colors the tokens of `theme.json`. Desktops are compact
 * (28-point controls, 13-point labels), touch screens roomier (36 to 40
 * points).
 */
export const colors: Palette = tokens<keyof Palette>({
  background: "background",
  surface: "card",
  inset: "inset",
  mutedFill: "muted",
  raised: "raised",
  field: "field",
  fieldBorder: "input",
  border: "border",
  line: "line",
  text: "foreground",
  muted: "muted-foreground",
  faint: "faint",
  accent: "brand",
  accentFill: "brand-fill",
  onAccent: "on-brand",
  light: "primary",
  onLight: "primary-foreground",
  sidebar: "sidebar",
  sidebarSelected: "sidebar-accent",
  sidebarBorder: "sidebar-border",
  track: "track",
  knob: "knob",
  code: "code",
  info: "info",
  warn: "warn",
  danger: "destructive",
  up: "up",
  down: "down",
});

/**
 * The window buttons an app draws for a frameless window on macOS (the
 * traffic lights): close, minimize and zoom in the system's hues, the
 * glyphs' ink over them, their hairline edge, and `off`, all three while
 * the window is in the background.
 */
export const windowControls = tokens<"close" | "minimize" | "zoom" | "ink" | "edge" | "off">({
  close: "window-close",
  minimize: "window-minimize",
  zoom: "window-zoom",
  ink: "window-control-ink",
  edge: "window-control-edge",
  off: "window-control-off",
});

/** `color` at opacity `a`. */
export function alpha(color: string, a: number) {
  return `color-mix(in srgb, ${color} ${a * 100}%, transparent)`;
}

/** The charts' series colors, in order (`theme.json`'s `chart-1` to
 * `chart-5`): the brand's citrus first, then graphite from dark to light,
 * so one series leads and the rest stay as quiet as the interface. */
export const chart = tokens({
  s1: "chart-1",
  s2: "chart-2",
  s3: "chart-3",
  s4: "chart-4",
  s5: "chart-5",
});

/** Translucent tints of the tones, for fills behind text. */
export const tints = tokens({
  accent: "brand-tint",
  info: "info-tint",
  warn: "warn-tint",
  danger: "destructive-tint",
  up: "up-tint",
  down: "down-tint",
});

/**
 * Light and depth, kept quiet: one-color edges (corners join cleanly), a
 * hard 1-point drop under what stands up and a 1-point inner shade in what
 * is sunk; only floating surfaces (menus, glass) cast a soft
 * shadow. `hover` and `pressed` are a raised control's states, `fill` a
 * slider's or a meter's run of the accent; `knob` a switch's knob on its
 * sunk track, `knobOn` the white one with an olive edge on the citrus.
 * `thumb` is a segmented control's or a tab strip's selected segment on
 * its sunk track: the raised fill dark; white with a soft drop light, where
 * the raised fill is all but the track's color.
 * `on` is what stays on (a toggle, a chosen tool, a selected button): a
 * fill that stands off every surface it sits on, and off a raised control
 * at rest, further than a hover does, so on and off read apart at a
 * glance. Dark, a step lighter than the raised fill; light, where a raised
 * fill is all but the color of the card and the inset under it, a deeper
 * neutral with an edge. `groove` is a hairline's lip of light under it, a
 * menu's separator cut into the surface.
 */
export const finish: Record<FinishRole, Finish> = {
  card: themed("card"),
  inset: themed("inset"),
  field: themed("field"),
  raised: themed("raised"),
  hover: themed("hover"),
  pressed: themed("pressed"),
  light: themed("light"),
  accent: themed("accent"),
  track: themed("track"),
  fill: themed("fill"),
  knob: themed("knob"),
  knobOn: themed("knobOn"),
  pill: themed("pill"),
  thumb: themed("thumb"),
  on: themed("on"),
  chip: themed("chip"),
  glass: themed("glass"),
  menu: themed("menu"),
  groove: themed("groove"),
};

/**
 * How far a press sinks a control, as the theme in use says (`finishes.json`'s `press.scale`):
 * `0.97` where a press is a small sink, `1` where the theme draws none. A control that sinks
 * deeper than that names its own scale (`pressSink(0.9)`); a theme of `1` turns every sink off.
 * Reactive: reading it follows `selectTheme`.
 */
export const press = {
  get scale() {
    return finishesOf().press.scale;
  },
};

/**
 * Switch the app to `theme` while it runs: the tokens first (`setTheme`),
 * then its finishes, so every component on screen redraws with both on the
 * next frame. `null` goes back to the theme the app was built with
 * (`nsh.json`'s `theme.json`, and `finishes.json` beside this file).
 *
 * A theme NSH refuses to read (a color it does not know) throws
 * `TypeError` and leaves the app as it was: the finishes follow the tokens
 * only once they are in.
 */
export function selectTheme(theme: AppTheme | null): void {
  setTheme(theme?.theme ?? null);
  selected.set(theme);
}

/**
 * The `id` of the theme the app shows (`selectTheme`), or `null` while it
 * shows its build-time one — the runtime cannot read `nsh-ui.json`. Reactive:
 * reading it subscribes.
 */
export function currentTheme(): string | null {
  const theme = selected();
  return theme === null ? null : theme.id;
}

export type Tone = "neutral" | "accent" | "info" | "warn" | "danger" | "up" | "down";

/** The color of a tone. */
export const toneColor = (tone: Tone) => (tone === "neutral" ? colors.muted : colors[tone]);

/** The tint of a tone. */
export const toneTint = (tone: Tone) => (tone === "neutral" ? colors.raised : tints[tone]);

/** A tone's tint as `toneTint` shows it on `base` (default the card), but
 * opaque: for what overlaps, such as stacked avatars, where a translucent
 * tint would let what is under it show through. */
export const solidTint = (tone: Tone, base: string = colors.surface) =>
  tone === "neutral"
    ? colors.raised
    : `color-mix(in srgb, ${toneColor(tone)} ${isDark() ? 16 : 10}%, ${base})`;

/** The monospaced family, for code (API names, identifiers). Figures use
 * the system font with tabular numbers instead. */
export const mono = "monospace";

/** Corner radii (`theme.json`'s `radius-card`, `radius`, `radius-control`, `radius-popover`). */
export const radius = {
  get card() {
    return token("radius-card");
  },
  get inset() {
    return token("radius");
  },
  get control() {
    return token("radius-control");
  },
  /** A dialog's corners: the floating tier's own, bigger than a card's. */
  get popover() {
    return token("radius-popover");
  },
};

/** The system header's colors on every page (iOS, Android). */
export const header = {
  get headerStyle() {
    return { backgroundColor: colors.background, color: colors.text, tintColor: colors.accent };
  },
};

/**
 * The motion every control shares: quick, slightly springy. `control` and
 * `move` are gpui-kit's `spring_control` (a 180 ms response, no overshoot:
 * a mark or a fill coming and going) and `spring_move` (280 ms, a damping
 * ratio of 0.85: a thumb or an indicator traveling) as a unit mass's
 * stiffness (2π / response)² and damping 2 · ratio · 2π / response.
 */
export const motion = {
  press: { stiffness: 520, damping: 34 },
  settle: { stiffness: 320, damping: 30 },
  control: { stiffness: 1218, damping: 70 },
  move: { stiffness: 504, damping: 38 },
  enter: { duration: 420, easing: Easing.out(Easing.cubic) },
} as const;

/**
 * An animated value that springs to `target` each time it changes (a
 * control's state: 1 while on, 0 while off), natively: JS only starts each
 * spring. A change mid-way turns it from where it is, with its velocity;
 * with reduced motion it lands at once. For discrete changes only: what
 * the pointer drives (a dragged thumb, a hover's place) is set in the same
 * frame, never sprung toward the pointer.
 */
export function follow(
  target: () => number,
  spring: { stiffness: number; damping: number } = motion.control,
): AnimatedValue {
  const v = createAnimatedValue(target());
  let shown = target();
  effect(() => {
    const next = target();
    if (next === shown) return;
    shown = next;
    if (reduceMotion()) v.set(next);
    else v.spring(next, spring);
  });
  return v;
}

/**
 * A pressable under the pointer (`hoverStyle`): a whisper of the text color
 * over its surface, quieter than pressed and than selected. Leave it off a
 * disabled control and off a selected one, whose own fill shows.
 */
export const hovered = (): ViewStyle => ({ backgroundColor: alpha(colors.text, 0.05) });

/**
 * The resting fill of a ghost control (a bare button, an icon button): none,
 * bare until the pointer is over it; in the terminal, which shows no hover
 * until the pointer is there and no outline to hint at one, a faint
 * `secondary` band, so it reads as pressable.
 */
export const ghostFill = () => (terminal ? token("secondary") : "transparent");

/**
 * The keyboard focus (`focusVisibleStyle`: not after a click or a tap): the
 * edge turns the theme's muted olive `ring` and a 3-point halo of it lies
 * around the view (`offset` moves the halo out from the edge).
 */
export const focusRing = (offset = 0): ViewStyle => ({
  borderColor: token("ring"),
  outlineStyle: "solid",
  outlineWidth: 3,
  outlineColor: alpha(token("ring"), 0.14),
  outlineOffset: offset,
});

/*
 * Below: this library's own, with no upstream origin.
 */

/**
 * A theme's fill for a run, a bar or a slider's range: its gradient where it gives one, else its
 * color. A theme may state both (a color under the gradient), as the build-time one does; the
 * gradient is what draws then, so what a theme that states one color alone says is a fill too.
 */
export function fillStyle(): ViewStyle {
  return finish.fill.backgroundImage === undefined
    ? { backgroundColor: finish.fill.backgroundColor }
    : { backgroundImage: finish.fill.backgroundImage };
}

/**
 * A rail's edge: a `width`-point inset line of `borderColor` inside the theme's `boxShadow`,
 * whichever of the two the theme gives. `finishes.json` may write `boxShadow: "none"` or leave
 * the color out, and a rail that joined the absent one after a comma would void the whole
 * declaration (`none, inset …` is not a shadow).
 */
export function insetEdge(
  borderColor: string | undefined,
  boxShadow: string | undefined,
  width = 1,
): string {
  const line = borderColor ? `inset 0 0 0 ${width}px ${borderColor}` : undefined;
  const shade = boxShadow && boxShadow !== "none" ? boxShadow : undefined;
  const parts = [line, shade].filter((part) => part !== undefined);
  return parts.length === 0 ? "none" : parts.join(", ");
}
