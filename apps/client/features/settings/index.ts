import type { WorkspaceModule } from "../moduleHost";
import { SettingsPage } from "./Page";

export const settingsModule: WorkspaceModule = {
  id: "settings",
  label: "Settings",
  shortLabel: "Set",
  icon: "system",
  Page: SettingsPage,
};
