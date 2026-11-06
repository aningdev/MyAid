import type { WorkspaceModule } from "../../workspace/types";
import { PluginsPage } from "./Page";

export const pluginsModule: WorkspaceModule = {
  id: "plugins",
  label: "Plugins",
  shortLabel: "Plug",
  icon: "sliders",
  Page: PluginsPage,
};
