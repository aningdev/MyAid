/**
 * The appearance the person picked: follow the system, or hold one scheme.
 * NSH applies it natively (`setColorScheme`); the palette comes from the
 * shadcn-nsh theme, so nothing here picks colors. A client preference: it
 * persists in `prefs/client.json` and never goes to dsh.
 */
import { setColorScheme, signal } from "nsh";

import type { MessageKey } from "./i18n";

/** Follow the system, or hold one scheme. */
export type AppearanceScheme = "system" | "light" | "dark";

export const APPEARANCE_SCHEMES: readonly { id: AppearanceScheme; label: MessageKey }[] = [
  { id: "system", label: "appearance.system" },
  { id: "light", label: "appearance.light" },
  { id: "dark", label: "appearance.dark" },
];

const scheme = signal<AppearanceScheme>("system");

export function appearanceScheme(): AppearanceScheme {
  return scheme();
}

/** Apply one scheme; the system's is the absence of a choice. */
export function applyScheme(next: AppearanceScheme): void {
  scheme.set(next);
  try {
    setColorScheme(next);
  } catch {
    // A headless runtime without a settable appearance keeps the one it has.
  }
}
