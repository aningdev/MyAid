/**
 * The themes the app carries, and the one the person picked. The app is built
 * with shadcn-nsh's shadcn theme (`nsh-ui.json`); `themes/default` is the
 * library's own look installed beside it, so a pick repaints the whole app at
 * once (`selectTheme`) without a relaunch. A client preference: it persists in
 * `prefs/client.json` and never goes to dsh.
 */
import { defaultTheme } from "../themes/default";
import type { MessageKey } from "./i18n";
import { currentTheme, selectTheme, type AppTheme } from "./theme";

/** The theme in use: an `AppTheme`'s id, or `null` for the one the app was built with. */
export type ThemeId = string | null;

/** One row of the choice: the theme it switches to, its id, and what the row says. */
export type ThemeChoice = {
  id: ThemeId;
  theme: AppTheme | null;
  label: MessageKey;
};

/**
 * The choices, in the order they are shown: the build-time theme first (it is
 * not an `AppTheme` — the runtime cannot read `nsh-ui.json`), then each theme
 * `add theme-<name>` copied in. A label is the app's own i18n key, not the
 * theme's `label`, which is not localised.
 */
export const THEMES: readonly ThemeChoice[] = [
  { id: null, theme: null, label: "settings.general.themeNeutral" },
  { id: defaultTheme.id, theme: defaultTheme, label: "settings.general.themeCitrus" },
];

/** The theme a stored id names: `null` for the build-time one, and for an id this build does not offer. */
export function themeById(id: ThemeId): AppTheme | null {
  return THEMES.find((choice) => choice.id === id)?.theme ?? null;
}

/** The theme in use, as the preference stores it (`null`: the build-time one). Reactive: reading it subscribes. */
export function themePref(): ThemeId {
  return currentTheme();
}

/** Switch the app to `id` (an unknown one is the build-time theme); every surface repaints on the next frame. */
export function applyTheme(id: ThemeId): void {
  try {
    selectTheme(themeById(id));
  } catch {
    // A runtime that cannot take the theme's tokens keeps the theme it has.
  }
}
