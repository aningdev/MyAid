import type { IWorkspaces } from "@myaid/dsh-web-protocol/client";

/**
 * The product commands that join the registry to dsh's Workspaces: a Bot's
 * conversation opens a dialogue over a Workspace, creating it when the
 * directory is new. The registry write and the dsh call are two steps on
 * purpose — each object keeps its own owner, and the UI reads the result from
 * dsh's follow stream.
 */
import { createDialogue, dialogueOfWorkspace, type Dialogue } from "../bots/model";
import { changeRegistry, registry, setActionError } from "../bots/state";
import { trimPath } from "./paths";
import { openWorkspace, workspaces, WorkspaceActionError } from "./state";

/** The official Workspace model, from the shared Connection. */
export async function workspaceModel(): Promise<IWorkspaces> {
  const api = await import("../../lib/dsh/session");
  const connection = await api.ensureConnected();
  return connection.workspaces;
}

/** `~` and `~/…` in a path a person typed, before dsh canonicalizes it. */
export async function expandHome(path: string): Promise<string> {
  const trimmed = path.trim();
  if (trimmed !== "~" && !trimmed.startsWith("~/")) return trimmed;
  const { homedir } = await import("os");
  const { join } = await import("path");
  return trimmed === "~" ? homedir() : join(homedir(), trimmed.slice(2));
}

/**
 * Create or reuse the Workspace over `path` and open a Dialogue on it for
 * `botId`. Two Bots on one directory get two Dialogues over one Workspace.
 */
export async function createDialogueOnPath(botId: string, path: string): Promise<Dialogue | null> {
  const target = await expandHome(path);
  if (!target) {
    setActionError("创建 Dialogue 前要填写工作区路径。");
    return null;
  }
  try {
    // This Bot already looks at that Workspace: the existing Dialogue is it.
    const known = knownWorkspaceId(botId, target);
    const existing = known
      ? registry().dialogues.find((item) => item.botId === botId && item.workspaceId === known)
      : undefined;
    if (existing) return existing;
    const model = await workspaceModel();
    const workspace = await openWorkspace(model, target);
    const next = await changeRegistry((reg) => {
      const already = dialogueOfWorkspace(reg, botId, workspace.id);
      return already ? reg : createDialogue(reg, { botId, workspaceId: workspace.id });
    });
    if (!next) return null;
    return dialogueOfWorkspace(next, botId, workspace.id);
  } catch (error) {
    setActionError(messageOf(error));
    return null;
  }
}

/** The driver's readable line for a failure. */
export function messageOf(error: unknown): string {
  if (error instanceof WorkspaceActionError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Workspace 调用失败。";
}

/** The Workspace id this Bot already uses for `path`, when the projection has it. */
function knownWorkspaceId(botId: string, path: string): string {
  const key = trimPath(path);
  for (const dialogue of registry().dialogues) {
    if (dialogue.botId !== botId) continue;
    const row = workspaces().rows.find((item) => item.id === dialogue.workspaceId);
    if (row && trimPath(row.path) === key) return row.id;
  }
  return "";
}
