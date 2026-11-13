/**
 * Product commands that join the registry to dsh's Workspaces: a Dialogue is
 * created over a Workspace, renamed by retitling that Workspace, and its
 * Sessions are archived / restored / pinned through the Workspace Remotes.
 * The registry write and the dsh call are two steps on purpose — each object
 * keeps its own owner, and the UI reads the result from dsh's follow stream.
 */
import { signal } from "nsh";

import type { Connection } from "../../lib/dsh/connection";
import { createDialogue, dialogueOfWorkspace, type Dialogue } from "../bots/model";
import { changeRegistry, registry, setActionError } from "../bots/state";
import {
  WorkspaceActionError,
  activitySummary,
  archiveSession,
  moveSession as moveWorkspaceSession,
  openWorkspace,
  pinSession as pinWorkspaceSession,
  renameWorkspace,
  unarchiveSession as unarchiveWorkspaceSession,
  unpinSession as unpinWorkspaceSession,
  workspaces,
} from "./state";

/** The shared Connection, connected on demand (the Workspace Remotes live on it). */
export async function workspaceConnection(): Promise<Connection> {
  const api = await import("../../lib/dsh/session");
  return api.ensureConnected();
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
    const before = registry().dialogues.find(
      (item) => item.botId === botId && item.workspaceId === existingWorkspaceId(botId, target),
    );
    if (before) return before;
    const connection = await workspaceConnection();
    const workspace = await openWorkspace(connection, target);
    const next = await changeRegistry((reg) => {
      const existing = dialogueOfWorkspace(reg, botId, workspace.id);
      return existing ? reg : createDialogue(reg, { botId, workspaceId: workspace.id });
    });
    if (!next) return null;
    return dialogueOfWorkspace(next, botId, workspace.id);
  } catch (error) {
    setActionError(messageOf(error));
    return null;
  }
}

/** Rename a Dialogue: the Workspace title is shared by every Bot on it. */
export async function renameDialogue(dialogueId: string, title: string): Promise<void> {
  const dialogue = registry().dialogues.find((item) => item.id === dialogueId);
  const next = title.trim();
  if (!dialogue || !next) return;
  const connection = await workspaceConnection();
  await renameWorkspace(connection, dialogue.workspaceId, next);
}

/**
 * A Session dsh refused to archive because it still works, with the work dsh
 * named; the Navigator offers "Stop and archive" for it.
 */
export const archiveBlocked = signal<{ sessionId: string; activity: string } | null>(null);

/**
 * Archive one Session. A Session that is still working is refused by dsh with
 * `workspace/session-active`; that refusal becomes `archiveBlocked`, and
 * {@link stopAndArchiveSession} retries with dsh's own `stopActivity`.
 */
export async function archiveDialogueSession(
  sessionId: string,
  options: { stopActivity?: boolean } = {},
): Promise<void> {
  await archiveWith(await workspaceConnection(), sessionId, options);
}

/** The refusal's own retry: dsh stops the work, then archives. */
export async function stopAndArchiveSession(sessionId: string): Promise<void> {
  await archiveDialogueSession(sessionId, { stopActivity: true });
}

export function dismissArchiveBlocked(): void {
  archiveBlocked.set(null);
}

/**
 * Archive over one Connection. A `workspace/session-active` refusal becomes
 * the blocked notice dsh's own details describe; any other failure is the
 * caller's to report.
 */
export async function archiveWith(
  connection: Connection,
  sessionId: string,
  options: { stopActivity?: boolean } = {},
): Promise<void> {
  try {
    await archiveSession(connection, sessionId, options);
  } catch (error) {
    if (error instanceof WorkspaceActionError && error.code === "workspace/session-active") {
      archiveBlocked.set({ sessionId, activity: activitySummary(error.details) });
    }
    throw error;
  }
  archiveBlocked.set(null);
  await refreshSessionRows();
}

export async function unarchiveDialogueSession(sessionId: string): Promise<void> {
  const connection = await workspaceConnection();
  await unarchiveWorkspaceSession(connection, sessionId);
  await refreshSessionRows();
}

/** Pin / unpin a Session in dsh; the Favorites section reads that pin set. */
export async function setSessionPinned(sessionId: string, pinned: boolean): Promise<void> {
  const connection = await workspaceConnection();
  if (pinned) await pinWorkspaceSession(connection, sessionId);
  else await unpinWorkspaceSession(connection, sessionId);
}

/** Move one Session within its Workspace's manual order. */
export async function moveDialogueSession(
  dialogueId: string,
  sessionId: string,
  beforeSessionId?: string,
): Promise<void> {
  const dialogue = registry().dialogues.find((item) => item.id === dialogueId);
  if (!dialogue) return;
  const connection = await workspaceConnection();
  await moveWorkspaceSession(connection, dialogue.workspaceId, sessionId, beforeSessionId);
}

/** A dsh refusal is the useful message; a transport failure keeps its own. */
export function messageOf(error: unknown): string {
  if (error instanceof WorkspaceActionError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Workspace 调用失败。";
}

/** The Session's archive flag, as dsh last reported it. */
export function sessionArchived(sessionId: string): boolean {
  return workspaces().archived.has(sessionId);
}

/** The Session's pin flag, as dsh last reported it. */
export function sessionPinned(sessionId: string): boolean {
  return workspaces().pinned.includes(sessionId);
}

/** The Workspace id this Bot already uses for `path`, when the projection has it. */
function existingWorkspaceId(botId: string, path: string): string {
  const normalized = path.replace(/\/+$/, "");
  for (const dialogue of registry().dialogues) {
    if (dialogue.botId !== botId) continue;
    const row = workspaces().rows.find((item) => item.id === dialogue.workspaceId);
    if (row && row.path.replace(/\/+$/, "") === normalized) return row.id;
  }
  return "";
}

async function refreshSessionRows(): Promise<void> {
  const { refreshSessionList } = await import("../dialogue/session/runtime");
  await refreshSessionList().catch(() => undefined);
}
