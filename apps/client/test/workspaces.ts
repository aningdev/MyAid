/**
 * Workspace fixtures for harnesses and unit tests: a follow baseline as dsh
 * would send it, and the official Workspace model over a stand-in Remote.
 */
import type { WorkspaceBaseline } from "@dsh-bot/dsh-web-protocol/workspace";

import {
  EMPTY_WORKSPACES,
  type WorkspaceProjection,
  type WorkspaceRow,
} from "../features/workspace/projection";
import { WORKSPACES_STORAGE_KEY } from "../features/workspace/state";
import { officialWorkspaceClient } from "../lib/dsh/sdk.js";

export function workspaceRow(
  input: { id: string; path: string } & Partial<Omit<WorkspaceRow, "id" | "path">>,
): WorkspaceRow {
  return {
    id: input.id,
    path: input.path,
    title: input.title ?? input.path.replace(/\/+$/, "").split("/").pop() ?? input.path,
    sessionIds: input.sessionIds ?? [],
    updatedAt: input.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

export function workspaceProjection(
  input: {
    rows?: readonly WorkspaceRow[];
    archived?: readonly string[];
    pinned?: readonly string[];
  } = {},
): WorkspaceProjection {
  return input.rows === undefined && input.archived === undefined && input.pinned === undefined
    ? EMPTY_WORKSPACES
    : {
        rows: input.rows ?? [],
        archived: new Set(input.archived ?? []),
        pinned: input.pinned ?? [],
      };
}

/**
 * The Storage entry a Host-less test app reads as its Workspace baseline:
 * the same values the official model's baseline would have carried.
 */
export function workspaceStorage(input: {
  rows?: readonly WorkspaceRow[];
  archived?: readonly string[];
  pinned?: readonly string[];
}): Record<string, string> {
  const baseline: WorkspaceBaseline = {
    items: (input.rows ?? []).map((row) => ({
      workspaceId: row.id as WorkspaceBaseline["items"][number]["workspaceId"],
      path: row.path,
      title: row.title,
      sessionIds: row.sessionIds as unknown as WorkspaceBaseline["items"][number]["sessionIds"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: row.updatedAt,
    })),
    archivedSessionIds: (input.archived ??
      []) as unknown as WorkspaceBaseline["archivedSessionIds"],
    pinnedSessionIds: (input.pinned ?? []) as unknown as WorkspaceBaseline["pinnedSessionIds"],
  };
  return { [WORKSPACES_STORAGE_KEY]: JSON.stringify(baseline) };
}

/**
 * The official Workspace model over a stand-in Remote namespace: tests drive
 * its own baseline/increments, and the product projection reads its snapshot.
 */
export function workspaceModel(): {
  model: import("@dsh-bot/dsh-web-protocol/client").ClientWorkspaceModel;
} {
  const ClientWorkspaceModel = (
    officialWorkspaceClient as unknown as {
      ClientWorkspaceModel: new (remote: unknown) => unknown;
    }
  ).ClientWorkspaceModel;
  return { model: new ClientWorkspaceModel(remoteWorkspace()) as never };
}

/** One `workspace.*` Remote answer shape the model consumes. */
export type RemoteAnswer = { ok: true; value: unknown } | { ok: false; error: unknown };

/**
 * A stand-in for the generated `workspace` Remote namespace. `answer` overrides
 * every call, so a test can make the Host refuse.
 */
export function remoteWorkspace(
  answer?: RemoteAnswer,
): Record<string, unknown> & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const ok = (value: unknown): RemoteAnswer => answer ?? { ok: true, value };
  const method =
    (name: string, value: unknown) =>
    async (...args: unknown[]) => {
      calls.push([name, ...args]);
      return ok(value);
    };
  const workspace = { workspaceId: "ws", path: "/work/dsh-bot", title: "dsh-bot", sessionIds: [] };
  return {
    calls,
    create: method("create", { workspace, created: true }),
    initializeDefault: method("initializeDefault", { workspace }),
    rename: method("rename", { workspace }),
    delete: method("delete", { workspaceId: "ws" }),
    insertBefore: method("insertBefore", { workspaceIds: ["ws"] }),
    insertSessionBefore: method("insertSessionBefore", { workspace }),
    archiveSession: method("archiveSession", { archivedSessionIds: [] }),
    unarchiveSession: method("unarchiveSession", { archivedSessionIds: [] }),
    pinSession: method("pinSession", { pinnedSessionIds: [] }),
    unpinSession: method("unpinSession", { pinnedSessionIds: [] }),
  };
}

/**
 * A stand-in for `ctx.workspaces`: records commands, answers with the fixture
 * rows, and refuses with `rpcError` when asked.
 */
export function fakeWorkspaces(
  answer?: RemoteAnswer,
): import("@dsh-bot/dsh-web-protocol/client").IWorkspaces & {
  calls: unknown[][];
} {
  const remote = remoteWorkspace(answer);
  const refuse = (): never => {
    const failure = answer?.ok === false ? answer.error : {};
    throw Object.assign(new Error("workspace failed"), { rpcError: failure });
  };
  const run = async (name: string, ...args: unknown[]) => {
    (remote[name] as (...rest: unknown[]) => Promise<RemoteAnswer>)(...args);
    if (answer && answer.ok === false) refuse();
    return { workspaceId: "ws", path: "/work/dsh-bot", title: "dsh-bot", sessionIds: [] };
  };
  return {
    calls: remote.calls,
    list: {
      getSnapshot: () => ({ items: [], archivedSessionIds: [], pinnedSessionIds: [] }),
      subscribe: () => () => undefined,
    },
    create: (input: unknown) => run("create", input),
    initializeDefault: async () => undefined,
    rename: (id: string, title: string) => run("rename", id, title),
    delete: async (id: string) => run("delete", id),
    insertBefore: async (id: string, before?: string) => run("insertBefore", id, before),
    archiveSession: async (id: string, options?: unknown) => {
      await run("archiveSession", id, options);
    },
    unarchiveSession: async (id: string) => {
      await run("unarchiveSession", id);
    },
    pinSession: async (id: string) => {
      await run("pinSession", id);
    },
    unpinSession: async (id: string) => {
      await run("unpinSession", id);
    },
    insertSessionBefore: (workspaceId: string, sessionId: string, before?: string) =>
      run("insertSessionBefore", workspaceId, sessionId, before),
  } as never;
}
