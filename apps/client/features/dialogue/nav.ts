import { createNavStack } from "nsh/base";
import { untracked } from "nsh";
import { isDesktopLayout } from "../../workspace/layout";
import { setModuleAtRoot } from "../../workspace/state";
import { closeContext, openContext, selectItem, selectedId } from "./state";

export type DialogueRoute =
  | { name: "list" }
  | { name: "main"; selectedId: string }
  | { name: "context"; selectedId: string };

/** Mobile page stack owned by Dialogue (unused on desktop three-pane). */
export const dialogueNav = createNavStack<DialogueRoute>([{ name: "list" }]);

function syncAtRoot() {
  const top = untracked(dialogueNav.routes).at(-1);
  setModuleAtRoot(!top || top.name === "list");
}

export function openMain(id: string) {
  selectItem(id);
  if (untracked(isDesktopLayout)) return;
  const top = untracked(dialogueNav.routes).at(-1);
  if (top?.name === "main" && top.selectedId === id) return;
  if (top?.name === "context") {
    dialogueNav.setRoutes([{ name: "list" }, { name: "main", selectedId: id }]);
    syncAtRoot();
    return;
  }
  if (top?.name === "main") {
    dialogueNav.replace({ name: "main", selectedId: id });
    syncAtRoot();
    return;
  }
  dialogueNav.push({ name: "main", selectedId: id });
  syncAtRoot();
}

export function openContextPage() {
  const id = untracked(selectedId);
  if (!id) return;
  openContext();
  if (untracked(isDesktopLayout)) return;
  const top = untracked(dialogueNav.routes).at(-1);
  if (top?.name === "context") return;
  dialogueNav.push({ name: "context", selectedId: id });
  syncAtRoot();
}

export function closeContextPage() {
  closeContext();
  if (untracked(isDesktopLayout)) return;
  const top = untracked(dialogueNav.routes).at(-1);
  if (top?.name === "context") dialogueNav.pop();
  syncAtRoot();
}

export function resetDialogueStack() {
  dialogueNav.setRoutes([{ name: "list" }]);
  selectItem(null);
  closeContext();
  setModuleAtRoot(true);
}

export function onContextDismiss() {
  closeContext();
  setModuleAtRoot(untracked(dialogueNav.routes).at(-1)?.name === "list");
}

export function popDialogue() {
  const top = untracked(dialogueNav.routes).at(-1);
  dialogueNav.pop();
  // Prefer pre-pop top: routes may not have flushed yet when syncing.
  setModuleAtRoot(!top || top.name === "main" || top.name === "list");
}
