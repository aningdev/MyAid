/**
 * The interface language the person picked. The row and its saved preference
 * land here now; applying the choice to the copy is the language-pack pass
 * (L4), so until then the page says the choice takes effect after the pack.
 * It is a client preference and never goes to dsh.
 */
import { signal } from "nsh";

export type LanguagePref = "system" | "zh" | "en";

export const LANGUAGES: readonly { id: LanguagePref; label: string }[] = [
  { id: "system", label: "跟随系统" },
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
];

const language = signal<LanguagePref>("system");

export function languagePref(): LanguagePref {
  return language();
}

export function setLanguagePref(next: LanguagePref): void {
  language.set(next);
}
