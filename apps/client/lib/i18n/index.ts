/**
 * The Client's interface language: one preference, one catalog, one way to
 * read a message. Every user-visible string goes through `t()`; a component
 * never holds UI text of its own (see apps/client/AGENTS.md).
 *
 * The preference is 跟随系统 (`system`), 简体中文 (`zh`) or English (`en`);
 * `system` reads NSH's `locale()` and follows a change (a `zh*` tag is
 * 简体中文, anything else English). Switching applies at once because every
 * `t()` reads the preference and the locale, both reactive; nothing reloads.
 * The choice is a client preference (`components/shell/prefs.ts`), never dsh's.
 */
import { signal } from "nsh";
import { locale } from "nsh";

import { messages, type MessageKey } from "./messages";

export { messages } from "./messages";
export type { CatalogEntry, MessageKey } from "./messages";

/** Follow the system, or hold one language. */
export type LanguagePref = "system" | "zh" | "en";

/** The two languages the catalog has. */
export type UiLanguage = "zh" | "en";

/** The General page's rows: the endonyms a language picker shows. */
export const LANGUAGES: readonly { id: LanguagePref; label: MessageKey }[] = [
  { id: "system", label: "language.followSystem" },
  { id: "zh", label: "language.zh" },
  { id: "en", label: "language.en" },
];

const preference = signal<LanguagePref>("system");

export function languagePref(): LanguagePref {
  return preference();
}

export function setLanguagePref(next: LanguagePref): void {
  preference.set(next);
}

/** The language a BCP 47 tag names: `zh*` is 简体中文, anything else English. */
export function languageOf(tag: string): UiLanguage {
  return /^zh/i.test(tag) ? "zh" : "en";
}

/** The language the copy shows now (reactive: the preference and the system's locale). */
export function uiLanguage(): UiLanguage {
  const choice = preference();
  return choice === "system" ? languageOf(locale()) : choice;
}

/** `t`'s values: what the catalog's `{name}` placeholders become. */
export type MessageValues = Record<string, string | number>;

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/**
 * The message `key` names, in the language the app shows; `values` fills its
 * `{name}` placeholders. Reading it subscribes the view to the language, so a
 * switch redraws the text where it stands.
 */
export function t(key: MessageKey, values?: MessageValues): string {
  const text = messages[key][uiLanguage()];
  if (!values) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** One key per plural form of a count. */
export function tCount(
  one: MessageKey,
  other: MessageKey,
  count: number,
  values: MessageValues = {},
): string {
  return t(count === 1 ? one : other, { count, ...values });
}
