/**
 * The Navigator's one small form: renaming a Bot. Its target lives here so
 * the row's context menu, and anything else that offers the verb, can open it
 * without owning a form.
 */
import { signal } from "nsh";

export type RenameTarget = { botId: string; value: string };

const rename = signal<RenameTarget | null>(null);

export function renameTarget(): RenameTarget | null {
  return rename();
}

export function openRename(target: RenameTarget): void {
  rename.set(target);
}

export function closeRename(): void {
  rename.set(null);
}
