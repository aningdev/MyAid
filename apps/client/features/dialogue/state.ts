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

const modelState = signal<Model>("Swift");
const providerState = signal<Provider>("Codex");
/** Bumped on every New chat so an already-empty session still clears/resets. */
const chatEpochState = signal(0);
/** Selected conversation within Dialogue. */
const selectedIdState = signal<string | null>(null);
/** Desktop: Context column visible. Mobile: mirrored while Context page is on stack. */
const contextOpenState = signal(false);

export function model() {
  return modelState();
}

export function setModel(next: Model) {
  modelState.set(next);
}

export function provider() {
  return providerState();
}

export function setProvider(next: Provider) {
  providerState.set(next);
}

export function chatEpoch() {
  return chatEpochState();
}

export function selectedId() {
  return selectedIdState();
}

/** Read the selection without subscribing. Navigation uses this while it mutates the stack. */
export function peekSelectedId() {
  return untracked(selectedIdState);
}

export function contextOpen() {
  return contextOpenState();
}

export function beginNewChat() {
  chatEpochState.update((n) => n + 1);
}

export function selectItem(id: string | null) {
  if (untracked(selectedIdState) === id) return;
  selectedIdState.set(id);
  if (id === null) contextOpenState.set(false);
}

export function toggleContext() {
  contextOpenState.set(!untracked(contextOpenState));
}

export function openContext() {
  contextOpenState.set(true);
}

export function closeContext() {
  contextOpenState.set(false);
}

/** Reset Dialogue selection when leaving the module (called from setModule side if needed). */
export function resetDialogueSession() {
  selectedIdState.set(null);
  contextOpenState.set(false);
}
