import type { WorkspaceModule } from "../../workspace/types";
import { DialoguePage } from "./Page";

export const dialogueModule: WorkspaceModule = {
  id: "dialogue",
  label: "Dialogue",
  shortLabel: "Chat",
  icon: "chat",
  Page: DialoguePage,
};
