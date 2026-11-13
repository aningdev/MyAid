import type {
  WorkspaceBaseline,
  WorkspaceFollowFrame,
  WorkspaceView,
} from "@myaid/dsh-web-protocol/workspace";
import { expect, test } from "nsh/test";

import type { Connection, WorkspaceResult } from "../../lib/dsh/connection";
import {
  archiveBlocked,
  archiveSessionsWith,
  dismissArchiveBlocked,
  noteArchive,
} from "./dialogues";
import {
  acceptFrame,
  activitySummary,
  archiveSession,
  pinSession,
  moveSession,
  renameWorkspace,
  startWorkspaces,
  stopWorkspaces,
  unpinSession,
  workspaces,
  WorkspaceActionError,
  workspacesReady,
  workspaceError,
} from "./state";

function view(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    workspaceId: "ws" as unknown as WorkspaceView["workspaceId"],
    path: "/work/myaid",
    title: "myaid",
    sessionIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function baseline(overrides: Partial<WorkspaceBaseline> = {}): WorkspaceBaseline {
  return { items: [], archivedSessionIds: [], pinnedSessionIds: [], ...overrides };
}

/** The Connection methods the Workspace module calls, as a recording double. */
function fakeConnection(result?: WorkspaceResult<unknown>): Connection & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const answer =
    result ?? ({ ok: true, value: { archivedSessionIds: [] } } as WorkspaceResult<unknown>);
  const connection = {
    calls,
    createWorkspace: async (path: string) => {
      calls.push(["create", path]);
      return (
        result ??
        ({ ok: true, value: { workspace: view(), created: true } } as WorkspaceResult<unknown>)
      );
    },
    renameWorkspace: async (workspaceId: string, title: string) => {
      calls.push(["rename", workspaceId, title]);
      return result ?? ({ ok: true, value: { workspace: view() } } as WorkspaceResult<unknown>);
    },
    archiveWorkspaceSession: async (sessionId: string, stopActivity?: boolean) => {
      calls.push(["archive", sessionId, stopActivity]);
      return answer;
    },
    unarchiveWorkspaceSession: async (sessionId: string) => {
      calls.push(["unarchive", sessionId]);
      return answer;
    },
    pinWorkspaceSession: async (sessionId: string) => {
      calls.push(["pin", sessionId]);
      return result ?? ({ ok: true, value: { pinnedSessionIds: [] } } as WorkspaceResult<unknown>);
    },
    unpinWorkspaceSession: async (sessionId: string) => {
      calls.push(["unpin", sessionId]);
      return result ?? ({ ok: true, value: { pinnedSessionIds: [] } } as WorkspaceResult<unknown>);
    },
    moveWorkspaceSession: async (workspaceId: string, sessionId: string, before?: string) => {
      calls.push(["move", workspaceId, sessionId, before]);
      return result ?? ({ ok: true, value: { workspace: view() } } as WorkspaceResult<unknown>);
    },
  };
  return connection as unknown as Connection & { calls: unknown[][] };
}

function reset(): void {
  workspaces.set({ rows: [], archived: new Set(), pinned: [] });
  workspacesReady.set(false);
  archiveBlocked.set(null);
}

test("a baseline replaces the whole projection and marks the tree readable", () => {
  reset();
  acceptFrame({
    type: "baseline",
    value: baseline({
      items: [view({ sessionIds: ["s1"] as unknown as WorkspaceView["sessionIds"] })],
      archivedSessionIds: ["s1"] as unknown as WorkspaceBaseline["archivedSessionIds"],
      pinnedSessionIds: ["s1"] as unknown as WorkspaceBaseline["pinnedSessionIds"],
    }),
  });
  expect(workspacesReady()).toBe(true);
  expect(workspaces().rows).toHaveLength(1);
  expect(workspaces().rows[0]?.title).toBe("myaid");
  expect([...workspaces().archived]).toEqual(["s1"]);
  expect(workspaces().pinned).toEqual(["s1"]);
  reset();
});

test("increments upsert, remove, order, archive and pin the rows they name", () => {
  reset();
  acceptFrame({ type: "baseline", value: baseline() });

  acceptFrame({ type: "upsert", workspace: view() });
  acceptFrame({
    type: "upsert",
    workspace: view({
      workspaceId: "ws-2" as unknown as WorkspaceView["workspaceId"],
      title: "second",
    }),
  });
  expect(workspaces().rows.map((row) => row.id)).toEqual(["ws-2", "ws"]);

  acceptFrame({
    type: "order",
    workspaceIds: ["ws", "ws-2"] as unknown as WorkspaceBaseline["items"][number]["workspaceId"][],
  });
  expect(workspaces().rows.map((row) => row.id)).toEqual(["ws", "ws-2"]);

  // A newer row wins; a delayed older one is ignored.
  acceptFrame({
    type: "upsert",
    workspace: view({ title: "renamed", updatedAt: "2026-01-02T00:00:00.000Z" }),
  });
  acceptFrame({ type: "upsert", workspace: view({ title: "stale" }) });
  expect(workspaces().rows[0]?.title).toBe("renamed");

  acceptFrame({
    type: "archived",
    archivedSessionIds: ["s1"] as unknown as WorkspaceBaseline["archivedSessionIds"],
  });
  acceptFrame({
    type: "pinned",
    pinnedSessionIds: ["s2", "s1"] as unknown as WorkspaceBaseline["pinnedSessionIds"],
  });
  expect([...workspaces().archived]).toEqual(["s1"]);
  expect(workspaces().pinned).toEqual(["s2", "s1"]);

  acceptFrame({ type: "remove", workspaceId: "ws" as unknown as WorkspaceView["workspaceId"] });
  expect(workspaces().rows.map((row) => row.id)).toEqual(["ws-2"]);
  reset();
});

test("a replace frame supersedes everything before it without a new generation", () => {
  reset();
  acceptFrame({ type: "baseline", value: baseline({ items: [view()] }) });
  acceptFrame({ type: "replace", value: baseline({ items: [view({ title: "other" })] }) });
  expect(workspaces().rows.map((row) => row.title)).toEqual(["other"]);
  expect(workspacesReady()).toBe(true);
  reset();
});

test("commands pass the Dialogue's Workspace and Session to the Remote", async () => {
  const connection = fakeConnection();
  await renameWorkspace(connection, "ws", "release");
  await pinSession(connection, "s1");
  await unpinSession(connection, "s1");
  await moveSession(connection, "ws", "s2", "s1");
  expect(connection.calls).toEqual([
    ["rename", "ws", "release"],
    ["pin", "s1"],
    ["unpin", "s1"],
    ["move", "ws", "s2", "s1"],
  ]);
});

test("a refusal keeps dsh's code and details", async () => {
  const failure: WorkspaceResult<unknown> = {
    ok: false,
    code: "workspace/session-active",
    message: "Session s1 still has running work",
    details: { sessionId: "s1", activity: [{ kind: "turn" }] },
  };
  const connection = fakeConnection(failure);
  let error: unknown;
  try {
    await archiveSession(connection, "s1");
  } catch (reason) {
    error = reason;
  }
  expect(error instanceof WorkspaceActionError).toBe(true);
  expect((error as WorkspaceActionError).code).toBe("workspace/session-active");
  expect(activitySummary((error as WorkspaceActionError).details)).toBe("turn");
});

test("an active refusal is collected, and stopping archives with stopActivity", async () => {
  reset();
  const failure: WorkspaceResult<unknown> = {
    ok: false,
    code: "workspace/session-active",
    message: "Session s1 still has running work",
    details: {
      sessionId: "s1",
      activity: [{ kind: "turn" }, { kind: "subagent", items: [{ id: "a1", label: "Reviewer" }] }],
    },
  };
  const refused = fakeConnection(failure);
  const result = await archiveSessionsWith(refused, ["s1", "s2"]);
  expect(result.archived).toEqual([]);
  expect(result.refusals).toEqual([
    { sessionId: "s1", activity: "turn · subagent（Reviewer）" },
    { sessionId: "s2", activity: "turn · subagent（Reviewer）" },
  ]);
  expect(noteArchive(null, result.refusals)).toBe(false);
  expect(archiveBlocked()).toMatchObject({ dialogueId: null, refusals: result.refusals });
  dismissArchiveBlocked();

  // The retry asks dsh to stop the work; every Session is archived in turn.
  const accepted = fakeConnection();
  const retried = await archiveSessionsWith(accepted, ["s1", "s2"], { stopActivity: true });
  expect(retried.archived).toEqual(["s1", "s2"]);
  expect(accepted.calls).toEqual([
    ["archive", "s1", true],
    ["archive", "s2", true],
  ]);
  expect(noteArchive(null, retried.refusals)).toBe(true);
  expect(archiveBlocked()).toBe(null);
  dismissArchiveBlocked();
});

test("a whole-Dialogue refusal names the Dialogue so its retry covers all", () => {
  reset();
  expect(noteArchive("dlg", [{ sessionId: "s1", activity: "turn" }])).toBe(false);
  expect(archiveBlocked()).toEqual({
    dialogueId: "dlg",
    refusals: [{ sessionId: "s1", activity: "turn" }],
  });
  expect(noteArchive("dlg", [])).toBe(true);
  expect(archiveBlocked()).toBe(null);
});

test("the follow loop takes every generation's baseline and stops cleanly", async () => {
  reset();
  let generations = 0;
  const connection = {
    workspaceFrames(signal: AbortSignal) {
      generations += 1;
      const frames: WorkspaceFollowFrame[] = [
        { type: "baseline", value: baseline({ items: [view({ title: `gen${generations}` })] }) },
      ];
      return {
        frames: (async function* () {
          for (const frame of frames) {
            if (signal.aborted) return;
            yield frame;
          }
        })(),
        dispose: () => undefined,
      };
    },
  } as unknown as Connection;
  startWorkspaces(connection);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(workspacesReady()).toBe(true);
  expect(workspaces().rows[0]?.title).toBe("gen1");
  await stopWorkspaces();
  // The stopped loop leaves nothing of the last generation behind.
  expect(workspaces().rows).toEqual([]);
  expect(workspacesReady()).toBe(false);
  expect(workspaceError()).toBe(null);
  reset();
});
