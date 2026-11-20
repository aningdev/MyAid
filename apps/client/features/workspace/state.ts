/**
 * The product's one view of dsh's Workspaces. dsh owns paths, titles, Session
 * order, pins and the archive set; the official `ClientWorkspaceModel`
 * (`ctx.workspaces.list`) is the only writer of this signal, so a mutation
 * becomes visible when dsh echoes it — never from a unary response. Commands
 * only call the official Workspace service.
 */
import type { IWorkspaces, WorkspaceSource, WorkspaceView } from "@dsh-bot/dsh-web-protocol/client";
import type { WorkspaceBaseline } from "@dsh-bot/dsh-web-protocol/workspace";
import { signal, Storage } from "nsh";

import { usesTestStorage } from "../../lib/data-root";
import {
  EMPTY_WORKSPACES,
  workspaceRowOf,
  type WorkspaceProjection,
  type WorkspaceRow,
} from "./projection";

export {
  EMPTY_WORKSPACES,
  isSessionArchived,
  orderedClaims,
  orderedDialogues,
  workspaceOf,
  workspacePath,
  workspaceRowOf,
  workspaceTitle,
  type WorkspaceProjection,
  type WorkspaceRef,
  type WorkspaceRow,
} from "./projection";

/**
 * Where an app opened by `test/open` gets a Workspace baseline without a Host
 * (the same isolated Storage that holds its registry). The product never sets
 * it: a real run reads the official Workspace model.
 */
export const WORKSPACES_STORAGE_KEY = "dsh-bot.workspaces";

/** What the official model has told this Client so far. */
export const workspaces = signal<WorkspaceProjection>(EMPTY_WORKSPACES);
/** True once a baseline arrived (the tree may read paths and titles). */
export const workspacesReady = signal(false);
/** The last model failure, kept while its stream retries. */
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

let detach: (() => void) | undefined;
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
 * Project the official Workspace model until `stopWorkspaces`. Each Host
 * generation replaces the model's snapshot atomically, so the tree can never
 * keep half of a previous generation.
 */
export function startWorkspaces(source: WorkspaceSource): void {
  if (detach) return;
  const read = () => accept(source.getSnapshot());
  const unsubscribe = source.subscribe(read);
  detach = () => unsubscribe();
  read();
}

export async function stopWorkspaces(): Promise<void> {
  detach?.();
  detach = undefined;
  workspaces.set(EMPTY_WORKSPACES);
  workspacesReady.set(false);
  workspaceError.set(null);
}

/**
 * A Host-less test app's baseline, read from its isolated Storage. A real app
 * has no such key and reads the official model instead.
 */
export async function loadStoredWorkspaces(): Promise<void> {
  if (!usesTestStorage() || workspacesReady()) return;
  const text = await Storage.getItem(WORKSPACES_STORAGE_KEY);
  if (!text) return;
  try {
    // The fixture is written in the same shape a follow baseline has.
    applyRows(JSON.parse(text) as WorkspaceBaseline);
  } catch {
    // An unreadable fixture is no baseline: the app shows what dsh tells it.
  }
}

/** One official Workspace snapshot → the product projection. */
function accept(snapshot: {
  items: readonly WorkspaceView[];
  archivedSessionIds: readonly string[];
  pinnedSessionIds: readonly string[];
  phase: string;
  error: { code?: string; message?: string } | null;
}): void {
  if (snapshot.phase === "ready") {
    workspaces.set({
      rows: snapshot.items.map(workspaceRowOf),
      archived: new Set(snapshot.archivedSessionIds),
      pinned: [...snapshot.pinnedSessionIds],
    });
    if (!workspacesReady()) {
      workspacesReady.set(true);
      const waiters = readyWaiters;
      readyWaiters = [];
      for (const waiter of waiters) waiter();
    }
  }
  workspaceError.set(snapshot.error ? `${snapshot.error.code}: ${snapshot.error.message}` : null);
}

/** Apply a stored follow baseline (the Host-less test fixture). */
function applyRows(baseline: WorkspaceBaseline): void {
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

// --- commands --------------------------------------------------------------

/**
 * Create or reuse the Workspace over a directory (the Dialogue's path). The
 * returned row is the Host's answer; the model's push is what updates the tree.
 */
export async function openWorkspace(model: IWorkspaces, path: string): Promise<WorkspaceRow> {
  return workspaceRowOf(await call("create", () => model.create({ path })));
}

/** Rename the Dialogue's Workspace: its title is the Dialogue's display name. */
export async function renameWorkspace(
  model: IWorkspaces,
  workspaceId: string,
  title: string,
): Promise<WorkspaceRow> {
  return workspaceRowOf(await call("rename", () => model.rename(workspaceId as never, title)));
}

/**
 * Archive one Session. dsh refuses a Session that still runs with
 * `workspace/session-active` (its details name the work); `stopActivity`
 * asks dsh to stop that work first, and the archive then stands.
 */
export async function archiveSession(
  model: IWorkspaces,
  sessionId: string,
  options: { stopActivity?: boolean } = {},
): Promise<void> {
  await call("archiveSession", () => model.archiveSession(sessionId as never, options));
}

/** Bring an archived Session back (the v6 migration keeps every old segment). */
export async function unarchiveSession(model: IWorkspaces, sessionId: string): Promise<void> {
  await call("unarchiveSession", () => model.unarchiveSession(sessionId as never));
}

/** Pin a Session: the migration carries a v4 file's Favorites pins here. */
export async function pinSession(model: IWorkspaces, sessionId: string): Promise<void> {
  await call("pinSession", () => model.pinSession(sessionId as never));
}

/** One Workspace command; the official service reports failures as `rpcError`. */
async function call<T>(operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const rpc = (error as { rpcError?: { code?: string; message?: string; details?: unknown } })
      .rpcError;
    if (!rpc?.code) throw error;
    throw new WorkspaceActionError(
      rpc.code,
      `workspace ${operation} failed: ${rpc.message ?? rpc.code}`,
      rpc.details,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
