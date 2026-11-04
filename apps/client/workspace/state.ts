import { signal, untracked } from "nsh";

/** Primary workspace modules (Nav Rail / Tab Bar). */
export type ModuleId =
  | "today"
  | "dialogue"
  | "tasks"
  | "outcomes"
  | "bots"
  | "knowledge"
  | "plugins"
  | "settings";

/** Active primary module. Default Today = blank home page. */
export const moduleId = signal<ModuleId>("today");

/**
 * Whether the active module is at its root (TabBar visible on mobile).
 * Modules that push internal pages set this false; shell only reads it.
 */
export const moduleAtRoot = signal(true);

export function setModule(id: ModuleId) {
  if (untracked(moduleId) === id) return;
  moduleId.set(id);
  moduleAtRoot.set(true);
}

export function setModuleAtRoot(atRoot: boolean) {
  moduleAtRoot.set(atRoot);
}
