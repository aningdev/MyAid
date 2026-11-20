import type { WorkspaceBaseline, WorkspaceView } from "@dsh-bot/dsh-web-protocol/workspace";
import { expect, test } from "nsh/test";

import { fakeWorkspaces, remoteWorkspace, workspaceModel } from "../../test/workspaces";
import {
  archiveSession,
  renameWorkspace,
  startWorkspaces,
  stopWorkspaces,
  workspaces,
  WorkspaceActionError,
  workspacesReady,
  workspaceError,
} from "./state";

function view(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  return {
    workspaceId: "ws" as unknown as WorkspaceView["workspaceId"],
    path: "/work/dsh-bot",
    title: "dsh-bot",
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
  expect(workspaces().rows[0]?.title).toBe("dsh-bot");
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

test("commands pass the Workspace and Session to the official service", async () => {
  const model = fakeWorkspaces();
  await renameWorkspace(model, "ws", "release");
  await archiveSession(model, "s1");
  expect(model.calls).toEqual([
    ["rename", "ws", "release"],
    ["archiveSession", "s1", {}],
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
