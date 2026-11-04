import type { JSX } from "nsh";
import type { IconName } from "../components/ui";
import type { ModuleId } from "./state";

/** One primary module: shell only mounts its Page; secondary layout is owned inside. */
export type WorkspaceModule = {
  id: ModuleId;
  label: string;
  /** Short label for the mobile tab bar. */
  shortLabel: string;
  icon: IconName;
  /** Full-bleed page for this primary nav item. */
  Page: () => JSX.Element;
};
