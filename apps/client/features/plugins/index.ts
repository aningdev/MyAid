import type { WorkspaceModule } from "../moduleHost";
import { PluginsPage } from "./Page";

export const pluginsModule: WorkspaceModule = {
  id: "plugins",
  label: "Plugins",
  shortLabel: "Plug",
  icon: "sliders",
  Page: PluginsPage,
};
