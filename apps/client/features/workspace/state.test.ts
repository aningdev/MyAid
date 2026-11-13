import type { WorkspaceBaseline, WorkspaceView } from "@myaid/dsh-web-protocol/workspace";
import { expect, test } from "nsh/test";

import { fakeWorkspaces, remoteWorkspace, workspaceModel } from "../../test/workspaces";
import {
  archiveBlocked,
  archiveSessionsWith,
  dismissArchiveBlocked,
  noteArchive,
} from "./dialogues";
import {
  activitySummary,
  archiveSession,
  moveSession,
  pinSession,
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

/** The official model coalesces its publishes onto a microtask. */
async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function reset(): Promise<void> {
  // `startWorkspaces` is a module-level subscription: leave the previous
  // test's model before the next one subscribes.
  await stopWorkspaces();
  workspaces.set({ rows: [], archived: new Set(), pinned: [] });
  workspacesReady.set(false);
  archiveBlocked.set(null);
}

test("the official baseline replaces the projection and marks the tree readable", async () => {
  await reset();
  const { model } = workspaceModel();
  startWorkspaces(model);
  model.replaceBaseline(
    baseline({
      items: [view({ sessionIds: ["s1"] as unknown as WorkspaceView["sessionIds"] })],
      archivedSessionIds: ["s1"] as unknown as WorkspaceBaseline["archivedSessionIds"],
      pinnedSessionIds: ["s1"] as unknown as WorkspaceBaseline["pinnedSessionIds"],
    }),
  );
  await settled();
  expect(workspacesReady()).toBe(true);
  expect(workspaces().rows).toHaveLength(1);
  expect(workspaces().rows[0]?.title).toBe("myaid");
  expect([...workspaces().archived]).toEqual(["s1"]);
  expect(workspaces().pinned).toEqual(["s1"]);
  await reset();
});

test("the model's own increments move the rows, the archive set and the pins", async () => {
  await reset();
  const { model } = workspaceModel();
  startWorkspaces(model);
  model.replaceBaseline(baseline());

  model.upsertView(view());
  model.upsertView(
    view({ workspaceId: "ws-2" as unknown as WorkspaceView["workspaceId"], title: "second" }),
  );
  await settled();
  expect(workspaces().rows.map((row) => row.id)).toEqual(["ws-2", "ws"]);

  model.replaceOrder([
    "ws",
    "ws-2",
  ] as unknown as WorkspaceBaseline["items"][number]["workspaceId"][]);
  await settled();
  expect(workspaces().rows.map((row) => row.id)).toEqual(["ws", "ws-2"]);

  model.replaceArchived(["s1"] as unknown as WorkspaceBaseline["archivedSessionIds"]);
  model.replacePinned(["s2", "s1"] as unknown as WorkspaceBaseline["pinnedSessionIds"]);
  await settled();
  expect([...workspaces().archived]).toEqual(["s1"]);
  expect(workspaces().pinned).toEqual(["s2", "s1"]);

  model.removeView("ws" as unknown as WorkspaceView["workspaceId"]);
  await settled();
  expect(workspaces().rows.map((row) => row.id)).toEqual(["ws-2"]);
  await reset();
});

test("a replaced baseline supersedes everything before it without a new generation", async () => {
  await reset();
  const { model } = workspaceModel();
  startWorkspaces(model);
  model.replaceBaseline(baseline({ items: [view()] }));
  model.replaceBaseline(baseline({ items: [view({ title: "other" })] }));
  await settled();
  expect(workspaces().rows.map((row) => row.title)).toEqual(["other"]);
  expect(workspacesReady()).toBe(true);
  await reset();
});

test("commands pass the Dialogue's Workspace and Session to the official service", async () => {
  const model = fakeWorkspaces();
  await renameWorkspace(model, "ws", "release");
  await pinSession(model, "s1");
  await unpinSession(model, "s1");
  await moveSession(model, "ws", "s2", "s1");
  expect(model.calls).toEqual([
    ["rename", "ws", "release"],
    ["pinSession", "s1"],
    ["unpinSession", "s1"],
    ["insertSessionBefore", "ws", "s2", "s1"],
  ]);
});

test("a refusal keeps dsh's code and details", async () => {
  const model = fakeWorkspaces({
    ok: false,
    error: {
      code: "workspace/session-active",
      message: "Session s1 still has running work",
      details: { sessionId: "s1", activity: [{ kind: "turn" }] },
    },
  });
  let error: unknown;
  try {
    await archiveSession(model, "s1");
  } catch (reason) {
    error = reason;
  }
  expect(error instanceof WorkspaceActionError).toBe(true);
  expect((error as WorkspaceActionError).code).toBe("workspace/session-active");
});

test("an active refusal is collected, and stopping archives with stopActivity", async () => {
  await reset();
  const refused = fakeWorkspaces({
    ok: false,
    error: {
      code: "workspace/session-active",
      message: "still running",
      details: {
        sessionId: "s1",
        activity: [
          { kind: "turn" },
          { kind: "subagent", items: [{ id: "a1", label: "Reviewer" }] },
        ],
      },
    },
  });
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
  const accepted = fakeWorkspaces();
  const retried = await archiveSessionsWith(accepted, ["s1", "s2"], { stopActivity: true });
  expect(retried.archived).toEqual(["s1", "s2"]);
  expect(accepted.calls).toEqual([
    ["archiveSession", "s1", { stopActivity: true }],
    ["archiveSession", "s2", { stopActivity: true }],
  ]);
  expect(noteArchive(null, retried.refusals)).toBe(true);
  expect(archiveBlocked()).toBe(null);
  dismissArchiveBlocked();
});

test("a whole-Dialogue refusal names the Dialogue so its retry covers all", async () => {
  await reset();
  expect(noteArchive("dlg", [{ sessionId: "s1", activity: "turn" }])).toBe(false);
  expect(archiveBlocked()).toEqual({
    dialogueId: "dlg",
    refusals: [{ sessionId: "s1", activity: "turn" }],
  });
  expect(noteArchive("dlg", [])).toBe(true);
  expect(archiveBlocked()).toBe(null);
});

test("a command failure is the same code the product branches on", async () => {
  const remote = remoteWorkspace({
    ok: false,
    error: { code: "workspace/session-active", message: "still running", details: {} },
  });
  const ClientWorkspaceModel = (
    (await import("../../lib/dsh/sdk.js")).officialWorkspaceClient as unknown as {
      ClientWorkspaceModel: new (remote: unknown) => {
        archiveSession(sessionId: string): Promise<{ ok: boolean }>;
      };
    }
  ).ClientWorkspaceModel;
  const model = new ClientWorkspaceModel(remote);
  const result = await model.archiveSession("s1");
  expect(result.ok).toBe(false);
});

test("stopping the projection leaves nothing of the last generation behind", async () => {
  await reset();
  const { model } = workspaceModel();
  startWorkspaces(model);
  model.replaceBaseline(baseline({ items: [view()] }));
  await settled();
  expect(workspacesReady()).toBe(true);
  await stopWorkspaces();
  expect(workspaces().rows).toEqual([]);
  expect(workspacesReady()).toBe(false);
  expect(workspaceError()).toBe(null);
  await reset();
});
