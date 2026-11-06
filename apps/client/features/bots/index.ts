import type { WorkspaceModule } from "../moduleHost";
import { BotsPage } from "./Page";

export const botsModule: WorkspaceModule = {
  id: "bots",
  label: "Bots",
  shortLabel: "Bots",
  icon: "components",
  Page: BotsPage,
};

export { presetForBot, resolveAgentPreset } from "./model";
