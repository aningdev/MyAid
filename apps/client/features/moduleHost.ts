/**
 * Stubs for the retired Module host (NavRail / moduleId).
 * Features are not mounted by the empty shell; these keep dormant code typechecking.
 */
import type { JSX } from "nsh";
import { signal } from "nsh";

import type { IconName } from "../components/ui";

export type ModuleId =
  | "today"
  | "dialogue"
  | "tasks"
  | "deliverables"
  | "bots"
  | "knowledge"
  | "plugins"
  | "settings";

export type WorkspaceModule = {
  id: ModuleId;
  label: string;
  shortLabel: string;
  icon: IconName;
  Page: () => JSX.Element;
};

const moduleIdState = signal<ModuleId>("today");
const moduleAtRootState = signal(true);

export function moduleId() {
  return moduleIdState();
}

export function moduleAtRoot() {
  return moduleAtRootState();
}

export function setModule(id: ModuleId) {
  moduleIdState.set(id);
  moduleAtRootState.set(true);
}

export function setModuleAtRoot(atRoot: boolean) {
  moduleAtRootState.set(atRoot);
}
