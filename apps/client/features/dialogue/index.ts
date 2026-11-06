import type { WorkspaceModule } from "../moduleHost";
import { DialoguePage } from "./Page";

export const dialogueModule: WorkspaceModule = {
  id: "dialogue",
  label: "Dialogue",
  shortLabel: "Chat",
  icon: "chat",
  Page: DialoguePage,
};
