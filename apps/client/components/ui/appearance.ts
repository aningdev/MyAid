/**
 * The appearance the person picked: the scheme (follow the system, light,
 * dark) and the accent colour. NSH applies the scheme natively
 * (`setColorScheme`); the accent is this app's own palette role, read by
 * `components/ui/theme.ts`. Both are client preferences — they persist in
 * `prefs/client.json` and never go to dsh.
 */
import { colorScheme, setColorScheme, signal } from "nsh";

/** Follow the system, or hold one scheme. */
export type AppearanceScheme = "system" | "light" | "dark";

/** The accent colours the General page offers. `default` is the theme's own. */
export type AccentChoice = "default" | "blue" | "violet" | "emerald" | "amber" | "rose";

/** One accent's colors: its hue in each appearance, and the text drawn on it. */
export type AccentSwatch = {
  id: AccentChoice;
  label: string;
  light: string;
  dark: string;
  on: string;
};

/**
 * A small, named palette rather than a colour picker: the UI needs a fill and
 * an on-fill that are both legible in each appearance, and a free picker
 * cannot promise either.
 */
export const ACCENTS: readonly AccentSwatch[] = [
  { id: "default", label: "默认", light: "", dark: "", on: "" },
  { id: "blue", label: "蓝", light: "#2563eb", dark: "#60a5fa", on: "#ffffff" },
  { id: "violet", label: "紫", light: "#7c3aed", dark: "#a78bfa", on: "#ffffff" },
  { id: "emerald", label: "绿", light: "#059669", dark: "#34d399", on: "#ffffff" },
  { id: "amber", label: "琥珀", light: "#d97706", dark: "#fbbf24", on: "#1c1917" },
  { id: "rose", label: "玫红", light: "#e11d48", dark: "#fb7185", on: "#ffffff" },
];

export const APPEARANCE_SCHEMES: readonly { id: AppearanceScheme; label: string }[] = [
  { id: "system", label: "跟随系统" },
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
];

const scheme = signal<AppearanceScheme>("system");
const accent = signal<AccentChoice>("default");

export function appearanceScheme(): AppearanceScheme {
  return scheme();
}

export function accentChoice(): AccentChoice {
  return accent();
}

/** True when the palette showing is dark (the system's, or the one the person chose). */
export function darkNow(): boolean {
  return colorScheme() === "dark";
}

/** The chosen accent's own hue (empty for the theme's default). */
export function accentColor(): string {
  const choice = ACCENTS.find((entry) => entry.id === accent());
  if (!choice || choice.id === "default") return "";
  return darkNow() ? choice.dark : choice.light;
}

/** Text and icons drawn on {@link accentColor}; empty when the theme's default applies. */
export function onAccentColor(): string {
  const choice = ACCENTS.find((entry) => entry.id === accent());
  return choice ? choice.on : "";
}

/** Apply one appearance; the scheme goes to NSH, the accent to this app's palette. */
export function applyAppearance(next: { scheme: AppearanceScheme; accent: AccentChoice }): void {
  scheme.set(next.scheme);
  accent.set(next.accent);
  try {
    setColorScheme(next.scheme);
  } catch {
    // A headless runtime without a settable appearance keeps the one it has.
  }
}

/** The appearance as it stands, for the prefs file. */
export function appearanceNow(): { scheme: AppearanceScheme; accent: AccentChoice } {
  return { scheme: scheme(), accent: accent() };
}
