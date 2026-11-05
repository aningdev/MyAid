import { signal, untracked } from "nsh";

import type { Model } from "./chat/scripts";

export const model = signal<Model>("Deep");
/** Catalog selection when Session is connected: `provider/model`. */
export const catalogModelKey = signal<string | null>(null);
/** Bumped when the local projection must reset (new/switch Session). */
export const chatEpoch = signal(0);

/** Selected Session id within Dialogue. */
export const selectedId = signal<string | null>(null);
/** Desktop: Context column visible. Mobile: mirrored while Context page is on stack. */
export const contextOpen = signal(false);

/** Read the selection without subscribing. Navigation uses this while it mutates the stack. */
export function peekSelectedId() {
  return untracked(selectedId);
}

export function selectItem(id: string | null) {
  if (untracked(selectedId) === id) return;
  selectedId.set(id);
  if (id === null) contextOpen.set(false);
}

export function bumpChatEpoch() {
  chatEpoch.update((n) => n + 1);
}

export function toggleContext() {
  contextOpen.set(!untracked(contextOpen));
}

export function openContext() {
  contextOpen.set(true);
}

export function closeContext() {
  contextOpen.set(false);
}

/** Reset Dialogue selection when leaving the module. */
export function resetDialogueSession() {
  selectedId.set(null);
  contextOpen.set(false);
}
