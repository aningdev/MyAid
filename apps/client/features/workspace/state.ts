import type {
  WorkspaceBaseline,
  WorkspaceFollowFrame,
  WorkspaceView,
} from "@myaid/dsh-web-protocol/workspace";
/**
 * The product's one view of dsh's Workspaces. dsh owns paths, titles, Session
 * order, pins and the archive set; `workspace.follow` is the only writer of
 * this signal, so a mutation is visible when dsh echoes it — never from a
 * local copy. Mutations themselves go back through the `workspace` Remote.
 *
 * `ClientWorkspaceModel` from `@deepseek-ai/dsh-api-workspace-controller/client`
 * is not used: its only published ESM entry is a `window.__ModuleLoader__`
 * bundle without a `node` export condition (and it imports `dsh-client-store`,
 * which the package does not ship), so QuickJS/NSH cannot load it. The follow
 * frames and Remote results are the same values the model would have consumed.
 */
import { signal, Storage } from "nsh";

import { usesTestStorage } from "../../lib/data-root";
import type { Connection, WorkspaceResult } from "../../lib/dsh/connection";
import type { Dialogue } from "../bots/model";
import {
  EMPTY_WORKSPACES,
  orderedClaims,
  orderedDialogues,
  pinnedClaims,
  workspaceRowOf,
  type WorkspaceProjection,
  type WorkspaceRow,
} from "./projection";

export * from "./projection";

/**
 * Where an app opened by `test/open` gets a Workspace baseline without a Host
 * (the same isolated Storage that holds its registry). The product never sets
 * it: a real run reads `workspace.follow`.
 */
export const WORKSPACES_STORAGE_KEY = "myaid.workspaces";

/** What dsh's stream has told this Client so far. */
export const workspaces = signal<WorkspaceProjection>(EMPTY_WORKSPACES);
/** True once a baseline arrived (the tree may read paths and titles). */
export const workspacesReady = signal(false);
/** The last stream failure, kept while the loop retries. */
export const workspaceError = signal<string | null>(null);

/** A refusal the product can branch on (`workspace/session-active`). */
export class WorkspaceActionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "WorkspaceActionError";
  }
}

let followAbort: AbortController | undefined;
let followRun: Promise<void> | undefined;
let readyWaiters: (() => void)[] = [];

/** Resolve once a baseline arrived, or after `timeoutMs` (the tree stays empty). */
export function whenWorkspacesReady(timeoutMs = 5_000): Promise<void> {
  if (workspacesReady()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      readyWaiters = readyWaiters.filter((waiter) => waiter !== done);
      resolve();
    };
    readyWaiters.push(done);
    if (timeoutMs > 0) setTimeout(done, timeoutMs);
  });
}

/**
 * Follow the Workspace projection on this Connection until `stopWorkspaces`.
 * Every generation starts from its baseline; a broken stream is reopened
 * rather than trusted, so a reconnect cannot leave a stale tree.
 */
export function startWorkspaces(connection: Connection): void {
  if (followRun) return;
  const abort = new AbortController();
  followAbort = abort;
  followRun = (async () => {
    let delay = 300;
    while (!abort.signal.aborted) {
      const stream = connection.workspaceFrames(abort.signal);
      let received = false;
      try {
        for await (const frame of stream.frames) {
          if (abort.signal.aborted) return;
          received = true;
          acceptFrame(frame);
        }
        if (abort.signal.aborted) return;
        workspaceError.set("Workspace 状态流已结束，正在重新连接。");
      } catch (error) {
        if (abort.signal.aborted) return;
        workspaceError.set(error instanceof Error ? error.message : String(error));
      } finally {
        stream.dispose();
      }
      // A generation that delivered anything resets the backoff.
      delay = received ? 300 : Math.min(delay * 2, 4_000);
      await sleep(delay, abort.signal);
    }
  })().finally(() => {
    followRun = undefined;
  });
}

export async function stopWorkspaces(): Promise<void> {
  followAbort?.abort();
  followAbort = undefined;
  const run = followRun;
  followRun = undefined;
  if (run) await run.catch(() => undefined);
  workspaces.set(EMPTY_WORKSPACES);
  workspacesReady.set(false);
  workspaceError.set(null);
}

/**
 * A Host-less test app's baseline, read from its isolated Storage. A real app
 * has no such key and waits for `workspace.follow` instead.
 */
export async function loadStoredWorkspaces(): Promise<void> {
  if (!usesTestStorage() || workspacesReady()) return;
  const text = await Storage.getItem(WORKSPACES_STORAGE_KEY);
  if (!text) return;
  try {
    applyBaseline(JSON.parse(text) as WorkspaceBaseline);
  } catch {
    // An unreadable fixture is no baseline: the app shows what dsh tells it.
  }
}

/** Apply one decoded follow frame to the projection. */
export function acceptFrame(frame: WorkspaceFollowFrame): void {
  switch (frame.type) {
    case "baseline":
      applyBaseline(frame.value);
      return;
    case "replace":
      applyBaseline(frame.value);
      return;
    case "upsert":
      upsertView(frame.workspace);
      return;
    case "remove":
      workspaces.update((current) => ({
        ...current,
        rows: current.rows.filter((row) => row.id !== frame.workspaceId),
      }));
      return;
    case "order":
      setOrder(frame.workspaceIds);
      return;
    case "archived":
      workspaces.update((current) => ({
        ...current,
        archived: new Set(frame.archivedSessionIds),
      }));
      return;
    case "pinned":
      workspaces.update((current) => ({ ...current, pinned: [...frame.pinnedSessionIds] }));
      return;
  }
}

function applyBaseline(baseline: WorkspaceBaseline): void {
  workspaces.set({
    rows: baseline.items.map(workspaceRowOf),
    archived: new Set(baseline.archivedSessionIds),
    pinned: [...baseline.pinnedSessionIds],
  });
  workspacesReady.set(true);
  workspaceError.set(null);
  const waiters = readyWaiters;
  readyWaiters = [];
  for (const waiter of waiters) waiter();
}

function upsertView(view: WorkspaceView): void {
  const row = workspaceRowOf(view);
  workspaces.update((current) => {
    const index = current.rows.findIndex((item) => item.id === row.id);
    if (index === -1) {
      // dsh prepends a created Workspace; an `order` frame may follow.
      return { ...current, rows: [row, ...current.rows] };
    }
    const installed = current.rows[index]!;
    // A unary echo and a follow frame race: the newer projection wins.
    if (Date.parse(row.updatedAt) < Date.parse(installed.updatedAt)) return current;
    return {
      ...current,
      rows: current.rows.map((item, position) => (position === index ? row : item)),
    };
  });
}

function setOrder(workspaceIds: readonly string[]): void {
  workspaces.update((current) => {
    const rank = new Map(workspaceIds.map((id, index) => [id, index]));
    const rows = [...current.rows].sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
    return { ...current, rows };
  });
}

// --- commands --------------------------------------------------------------

/**
 * Create or reuse the Workspace over a directory (the Dialogue's path). The
 * unary response is the Host's own row, merged ahead of its follow frame so a
 * caller can use the id and title right away.
 */
export async function openWorkspace(connection: Connection, path: string): Promise<WorkspaceRow> {
  const result = await connection.createWorkspace(path);
  if (!result.ok) throw failure("create", result);
  upsertView(result.value.workspace);
  return workspaceRowOf(result.value.workspace);
}

/** Rename the Dialogue's Workspace: its title is the Dialogue's display name. */
export async function renameWorkspace(
  connection: Connection,
  workspaceId: string,
  title: string,
): Promise<WorkspaceRow> {
  const result = await connection.renameWorkspace(workspaceId, title);
  if (!result.ok) throw failure("rename", result);
  upsertView(result.value.workspace);
  return workspaceRowOf(result.value.workspace);
}

/**
 * Archive one Session. dsh refuses a Session that still runs with
 * `workspace/session-active` (its details name the work); `stopActivity`
 * asks dsh to stop that work first, and the archive then stands.
 */
export async function archiveSession(
  connection: Connection,
  sessionId: string,
  options: { stopActivity?: boolean } = {},
): Promise<void> {
  const result = await connection.archiveWorkspaceSession(sessionId, options.stopActivity);
  if (!result.ok) throw failure("archiveSession", result);
}

export async function unarchiveSession(connection: Connection, sessionId: string): Promise<void> {
  const result = await connection.unarchiveWorkspaceSession(sessionId);
  if (!result.ok) throw failure("unarchiveSession", result);
}

/** Pin a Session ahead of unpinned ones; the Favorites section reads this. */
export async function pinSession(connection: Connection, sessionId: string): Promise<void> {
  const result = await connection.pinWorkspaceSession(sessionId);
  if (!result.ok) throw failure("pinSession", result);
}

export async function unpinSession(connection: Connection, sessionId: string): Promise<void> {
  const result = await connection.unpinWorkspaceSession(sessionId);
  if (!result.ok) throw failure("unpinSession", result);
}

/** Move one Session within its Workspace's manual order. */
export async function moveSession(
  connection: Connection,
  workspaceId: string,
  sessionId: string,
  beforeSessionId?: string,
): Promise<void> {
  const result = await connection.moveWorkspaceSession(workspaceId, sessionId, beforeSessionId);
  if (!result.ok) throw failure("insertSessionBefore", result);
}

function failure(
  operation: string,
  result: Extract<WorkspaceResult<unknown>, { ok: false }>,
): WorkspaceActionError {
  return new WorkspaceActionError(
    result.code,
    `workspace ${operation} failed: ${result.message}`,
    result.details,
  );
}

/** The work a `workspace/session-active` refusal names, as one line. */
export function activitySummary(details: unknown): string {
  const activity = (details as { activity?: unknown } | undefined)?.activity;
  if (!Array.isArray(activity)) return "";
  const parts: string[] = [];
  for (const item of activity) {
    const family = (item as { kind?: unknown; items?: unknown }).kind;
    if (typeof family !== "string") continue;
    const entries = (item as { items?: unknown }).items;
    const labels = Array.isArray(entries)
      ? entries.flatMap((entry) => {
          const label = (entry as { label?: unknown }).label;
          const id = (entry as { id?: unknown }).id;
          return [typeof label === "string" ? label : typeof id === "string" ? id : ""];
        })
      : [];
    const named = labels.filter(Boolean).join("、");
    parts.push(named ? `${family}（${named}）` : family);
  }
  return parts.join(" · ");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}
