import type { IWorkspaces } from "@myaid/dsh-web-protocol/client";
/**
 * Product commands that join the registry to dsh's Workspaces: a Dialogue is
 * created over a Workspace, renamed by retitling that Workspace, and its
 * Sessions are archived / restored / pinned through the Workspace Remotes.
 * The registry write and the dsh call are two steps on purpose — each object
 * keeps its own owner, and the UI reads the result from dsh's follow stream.
 */
import { signal } from "nsh";

import {
  createDialogue,
  dialogueOfWorkspace,
  removeDialogue as removeDialogueEntry,
  type Dialogue,
} from "../bots/model";
import { changeRegistry, registry, setActionError } from "../bots/state";
import { trimPath } from "./paths";
import {
  WorkspaceActionError,
  activitySummary,
  archiveSession,
  isSessionArchived,
  isSessionPinned,
  moveSession as moveWorkspaceSession,
  openWorkspace,
  pinSession as pinWorkspaceSession,
  renameWorkspace,
  unarchiveSession as unarchiveWorkspaceSession,
  unpinSession as unpinWorkspaceSession,
  workspaces,
} from "./state";

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

/** Rename a Dialogue: the Workspace title is shared by every Bot on it. */
export async function renameDialogue(dialogueId: string, title: string): Promise<void> {
  const dialogue = registry().dialogues.find((item) => item.id === dialogueId);
  const next = title.trim();
  if (!dialogue || !next) return;
  const model = await workspaceModel();
  await renameWorkspace(model, dialogue.workspaceId, next);
}

/**
 * One Session dsh refused to archive because it still works, with the work it
 * named. `dialogueId` is set when the refusal came from archiving a whole
 * Dialogue, so its retry covers every Session that was refused.
 */
export type ArchiveRefusal = { sessionId: string; activity: string };

/** A Session dsh refused to archive because it still works. */
export const archiveBlocked = signal<{
  dialogueId: string | null;
  refusals: readonly ArchiveRefusal[];
} | null>(null);

/**
 * Archive Sessions through the official Workspace model. A `workspace/session-active` refusal
 * is collected (dsh named the work); any other failure is the caller's to
 * report. dsh drops an archived Session's pin in the same write.
 */
export async function archiveSessionsWith(
  model: IWorkspaces,
  sessionIds: readonly string[],
  options: { stopActivity?: boolean } = {},
): Promise<{ archived: string[]; refusals: ArchiveRefusal[] }> {
  const archived: string[] = [];
  const refusals: ArchiveRefusal[] = [];
  for (const sessionId of sessionIds) {
    try {
      await archiveSession(model, sessionId, options);
      archived.push(sessionId);
    } catch (error) {
      if (!isActiveRefusal(error)) throw error;
      refusals.push({ sessionId, activity: activitySummary(error.details) });
    }
  }
  return { archived, refusals };
}

/**
 * Record what an archive call met: nothing refused clears the notice, a
 * refusal (or several) becomes the Stop-and-archive notice. Returns whether
 * the archive stands.
 */
export function noteArchive(
  dialogueId: string | null,
  refusals: readonly ArchiveRefusal[],
): boolean {
  if (refusals.length > 0) {
    archiveBlocked.set({ dialogueId, refusals });
    return false;
  }
  archiveBlocked.set(null);
  return true;
}

/**
 * Archive one Session. A running Session is refused by dsh with
 * `workspace/session-active`; that refusal becomes `archiveBlocked`, and the
 * notice's "Stop and archive" retries with dsh's own `stopActivity`.
 */
export async function archiveDialogueSession(
  sessionId: string,
  options: { stopActivity?: boolean } = {},
): Promise<boolean> {
  const result = await archiveSessionsWith(await workspaceModel(), [sessionId], options);
  if (!noteArchive(null, result.refusals)) return false;
  await refreshSessionRows();
  return true;
}

/**
 * Archive every claimed Session of a Dialogue through dsh. Sessions that
 * still work are refused; the refusal lists all of them so one confirmation
 * stops and archives the lot.
 */
export async function archiveWholeDialogue(
  dialogueId: string,
  options: { stopActivity?: boolean } = {},
): Promise<void> {
  const dialogue = registry().dialogues.find((item) => item.id === dialogueId);
  if (!dialogue) return;
  const projection = workspaces();
  const sessionIds = dialogue.claims
    .map((claim) => claim.sessionId)
    .filter((sessionId) => !isSessionArchived(projection, sessionId));
  if (sessionIds.length === 0) {
    archiveBlocked.set(null);
    return;
  }
  const result = await archiveSessionsWith(await workspaceModel(), sessionIds, options);
  if (!noteArchive(dialogueId, result.refusals)) return;
  await refreshSessionRows();
}

/** The refusal's own retry: dsh stops the work, then archives. */
export async function stopAndArchiveBlocked(): Promise<void> {
  const blocked = archiveBlocked();
  if (!blocked) return;
  archiveBlocked.set(null);
  const sessionIds = blocked.refusals.map((refusal) => refusal.sessionId);
  if (blocked.dialogueId) {
    await archiveWholeDialogue(blocked.dialogueId, { stopActivity: true });
    return;
  }
  const [sessionId] = sessionIds;
  if (sessionId) await archiveDialogueSession(sessionId, { stopActivity: true });
}

export function dismissArchiveBlocked(): void {
  archiveBlocked.set(null);
}

/** Remove an empty Dialogue from the registry; the dsh Workspace stays. */
export async function removeEmptyDialogue(dialogueId: string): Promise<boolean> {
  const next = await changeRegistry((reg) => removeDialogueEntry(reg, dialogueId));
  return next !== null;
}

export async function unarchiveDialogueSession(sessionId: string): Promise<void> {
  const model = await workspaceModel();
  await unarchiveWorkspaceSession(model, sessionId);
  await refreshSessionRows();
}

/** Pin / unpin a Session in dsh; the Favorites section reads that pin set. */
export async function setSessionPinned(sessionId: string, pinned: boolean): Promise<void> {
  const model = await workspaceModel();
  if (pinned) await pinWorkspaceSession(model, sessionId);
  else await unpinWorkspaceSession(model, sessionId);
}

/** Move one Session within its Workspace's manual order. */
export async function moveDialogueSession(
  dialogueId: string,
  sessionId: string,
  beforeSessionId?: string,
): Promise<void> {
  const dialogue = registry().dialogues.find((item) => item.id === dialogueId);
  if (!dialogue) return;
  const model = await workspaceModel();
  await moveWorkspaceSession(model, dialogue.workspaceId, sessionId, beforeSessionId);
}

/** A dsh refusal is the useful message; a transport failure keeps its own. */
export function messageOf(error: unknown): string {
  if (error instanceof WorkspaceActionError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Workspace 调用失败。";
}

/** The Session's archive flag, as dsh last reported it. */
export function sessionArchived(sessionId: string): boolean {
  return isSessionArchived(workspaces(), sessionId);
}

/** The Session's pin flag, as dsh last reported it. */
export function sessionPinned(sessionId: string): boolean {
  return isSessionPinned(workspaces(), sessionId);
}

function isActiveRefusal(error: unknown): error is WorkspaceActionError {
  return error instanceof WorkspaceActionError && error.code === "workspace/session-active";
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

async function refreshSessionRows(): Promise<void> {
  const { refreshSessionList } = await import("../dialogue/session/runtime");
  await refreshSessionList().catch(() => undefined);
}
