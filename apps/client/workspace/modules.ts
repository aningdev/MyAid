import { botsModule } from "../features/bots";
import { dialogueModule } from "../features/dialogue";
import { placeholderModule } from "../features/placeholder";
import { settingsModule } from "../features/settings";
import type { ModuleId } from "./state";
import type { WorkspaceModule } from "./types";

export const modules: WorkspaceModule[] = [
  placeholderModule("today", "Today", "Today", "spark"),
  dialogueModule,
  placeholderModule("tasks", "Tasks", "Tasks", "check"),
  placeholderModule("outcomes", "Outcomes", "Out", "arrow-up"),
  botsModule,
  placeholderModule("knowledge", "Knowledge", "Know", "storage"),
  placeholderModule("plugins", "Plugins", "Plug", "sliders"),
  settingsModule,
];

export function moduleById(id: ModuleId): WorkspaceModule {
  return modules.find((m) => m.id === id) ?? modules[0];
}
