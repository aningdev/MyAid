import type { WorkspaceBaseline, WorkspaceView } from "@dsh-bot/dsh-web-protocol/workspace";
import { expect, test } from "nsh/test";

import {
  EMPTY_WORKSPACES,
  orderedClaims,
  orderedDialogues,
  workspaceOf,
  workspacePath,
  workspaceRowOf,
  workspaceTitle,
  type WorkspaceProjection,
} from "./projection";

function view(overrides: Partial<WorkspaceView> = {}): WorkspaceView {
  const id = overrides.workspaceId ?? ("ws" as unknown as WorkspaceView["workspaceId"]);
  return {
    workspaceId: id,
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

function projection(input: Partial<WorkspaceProjection> = {}): WorkspaceProjection {
  return { ...EMPTY_WORKSPACES, ...input };
}

test("a Workspace view keeps its id, path, title and manual Session order", () => {
  const row = workspaceRowOf(
    view({ sessionIds: ["b", "a"] as unknown as WorkspaceView["sessionIds"] }),
  );
  expect(row).toEqual({
    id: "ws",
    path: "/work/dsh-bot",
    title: "dsh-bot",
    sessionIds: ["b", "a"],
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  expect(baseline().items).toEqual([]);
});

test("a Dialogue reads its Workspace's path and title, empty while unknown", () => {
  const state = projection({ rows: [workspaceRowOf(view())] });
  expect(workspaceOf(state, { workspaceId: "ws" })?.title).toBe("dsh-bot");
  expect(workspacePath(state, { workspaceId: "ws" })).toBe("/work/dsh-bot");
  expect(workspaceTitle(state, { workspaceId: "ws" })).toBe("dsh-bot");
  // dsh has not sent the row yet (or deleted it): nothing is invented.
  expect(workspaceOf(state, { workspaceId: "gone" })).toBe(null);
  expect(workspacePath(state, { workspaceId: "gone" })).toBe("");
  expect(workspaceTitle(state, { workspaceId: "gone" })).toBe("");
});

test("Dialogues follow dsh's Workspace order; an unknown one stays last", () => {
  const state = projection({
    rows: [
      workspaceRowOf(view({ workspaceId: "ws-b" as unknown as WorkspaceView["workspaceId"] })),
      workspaceRowOf(view({ workspaceId: "ws-a" as unknown as WorkspaceView["workspaceId"] })),
    ],
  });
  const dialogues = [
    { id: "dlg-a", workspaceId: "ws-a" },
    { id: "dlg-x", workspaceId: "ws-x" },
    { id: "dlg-b", workspaceId: "ws-b" },
  ];
  expect(orderedDialogues(state, dialogues).map((item) => item.id)).toEqual([
    "dlg-b",
    "dlg-a",
    "dlg-x",
  ]);
});

test("a Dialogue's Sessions follow the Workspace order and drop archived ones", () => {
  const state = projection({
    rows: [
      workspaceRowOf(view({ sessionIds: ["s2", "s1"] as unknown as WorkspaceView["sessionIds"] })),
    ],
    archived: new Set(["s2"]),
  });
  const claims = [{ sessionId: "s1" }, { sessionId: "s2" }, { sessionId: "s3" }];
  // s2 is archived; s3 is a claim the attach echo has not confirmed yet.
  expect(orderedClaims(state, { workspaceId: "ws" }, claims).map((item) => item.sessionId)).toEqual(
    ["s1", "s3"],
  );
});
