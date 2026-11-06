import { botsModule } from "../features/bots";
import { dialogueModule } from "../features/dialogue";
import { placeholderModule } from "../features/placeholder";
import { pluginsModule } from "../features/plugins";
import { settingsModule } from "../features/settings";
import type { ModuleId } from "./state";
import type { WorkspaceModule } from "./types";

export const modules: WorkspaceModule[] = [
  placeholderModule("today", "Today", "Today", "spark"),
  dialogueModule,
  placeholderModule("tasks", "Tasks", "Tasks", "check"),
  placeholderModule("deliverables", "Deliverables", "Deliv", "arrow-up"),
  botsModule,
  placeholderModule("knowledge", "Knowledge", "Know", "storage"),
  pluginsModule,
  settingsModule,
];

export function moduleById(id: ModuleId): WorkspaceModule {
  return modules.find((m) => m.id === id) ?? modules[0];
}
