import { signal, untracked } from "nsh";

import type { Provider } from "./chat/local";
import type { Model } from "./chat/scripts";
import { scenarios } from "./chat/scripts";

/** Conversation rows shown in the Dialogue list (from gallery AI Chat). */
export const conversations = [
  ...scenarios.map((s) => ({
    id: s.id,
    label: s.chip,
    detail: s.prompt.slice(0, 80) + (s.prompt.length > 80 ? "…" : ""),
  })),
  { id: "history", label: "Load a long conversation", detail: "Weeks of messages, loaded at once" },
  { id: "new", label: "New chat", detail: "Empty conversation" },
];

export const model = signal<Model>("Swift");
export const provider = signal<Provider>("Codex");
/** Bumped on every New chat so an already-empty session still clears/resets. */
export const chatEpoch = signal(0);

/** Selected conversation within Dialogue. */
export const selectedId = signal<string | null>(null);
/** Desktop: Context column visible. Mobile: mirrored while Context page is on stack. */
export const contextOpen = signal(false);

export function beginNewChat() {
  chatEpoch.update((n) => n + 1);
}

export function selectItem(id: string | null) {
  if (untracked(selectedId) === id) return;
  selectedId.set(id);
  if (id === null) contextOpen.set(false);
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

/** Reset Dialogue selection when leaving the module (called from setModule side if needed). */
export function resetDialogueSession() {
  selectedId.set(null);
  contextOpen.set(false);
}
