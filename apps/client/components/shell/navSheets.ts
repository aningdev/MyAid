/**
 * Small Navigator sheets: renaming a Dialogue or a Session, and a Bot's new
 * Dialogue. Their targets live here so the Navigator's context menus and the
 * shell's palette can open them without owning a form.
 */
import { signal } from "nsh";

export type RenameTarget =
  | { kind: "dialogue"; dialogueId: string; value: string }
  | { kind: "session"; dialogueId: string; sessionId: string; value: string };

export type NewDialogueTarget = {
  botId: string;
  botName: string;
  workspacePath: string;
};

const rename = signal<RenameTarget | null>(null);
const newDialogue = signal<NewDialogueTarget | null>(null);

export function renameTarget(): RenameTarget | null {
  return rename();
}

export function openRename(target: RenameTarget): void {
  rename.set(target);
}

export function closeRename(): void {
  rename.set(null);
}

export function newDialogueTarget(): NewDialogueTarget | null {
  return newDialogue();
}

export function openNewDialogue(target: NewDialogueTarget): void {
  newDialogue.set(target);
}

export function closeNewDialogue(): void {
  newDialogue.set(null);
}
