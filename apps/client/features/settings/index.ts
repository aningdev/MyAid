import type { WorkspaceModule } from "../../workspace/types";
import { SettingsPage } from "./Page";

export const settingsModule: WorkspaceModule = {
  id: "settings",
  label: "Settings",
  shortLabel: "Set",
  icon: "system",
  Page: SettingsPage,
};
