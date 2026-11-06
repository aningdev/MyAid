import { signal, untracked } from "nsh";

/** Primary workspace modules (Nav Rail / Tab Bar). */
export type ModuleId =
  | "today"
  | "dialogue"
  | "tasks"
  | "deliverables"
  | "bots"
  | "knowledge"
  | "plugins"
  | "settings";

/** Active primary module. Default Today = blank home page. */
const moduleIdState = signal<ModuleId>("today");

/**
 * Whether the active module is at its root (TabBar visible on mobile).
 * Modules that push internal pages set this false; shell only reads it.
 */
const moduleAtRootState = signal(true);

export function moduleId() {
  return moduleIdState();
}

export function moduleAtRoot() {
  return moduleAtRootState();
}

export function setModule(id: ModuleId) {
  if (untracked(moduleIdState) === id) return;
  moduleIdState.set(id);
  moduleAtRootState.set(true);
}

export function setModuleAtRoot(atRoot: boolean) {
  moduleAtRootState.set(atRoot);
}
