import { expect, test } from "nsh/test";

import {
  decodeWorkspaceBaseline,
  decodeWorkspaceFrame,
  WorkspaceFrameError,
} from "./workspace-frames";

const view = {
  workspaceId: "ws",
  path: "/work/myaid",
  title: "myaid",
  sessionIds: ["s1"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const baseline = {
  items: [view],
  archivedSessionIds: ["s2"],
  pinnedSessionIds: ["s1"],
};

test("a baseline decodes into the projection's rows", () => {
  const decoded = decodeWorkspaceBaseline(baseline);
  expect(decoded.items[0]?.workspaceId).toBe("ws");
  expect(decoded.items[0]?.sessionIds).toEqual(["s1"]);
  expect(decoded.archivedSessionIds).toEqual(["s2"]);
  expect(decoded.pinnedSessionIds).toEqual(["s1"]);
});

test("each follow increment decodes, and the group frames keep their ids", () => {
  expect(decodeWorkspaceFrame({ type: "baseline", value: baseline })).toMatchObject({
    type: "baseline",
  });
  expect(decodeWorkspaceFrame({ type: "replace", value: baseline })).toMatchObject({
    type: "replace",
  });
  expect(decodeWorkspaceFrame({ type: "upsert", workspace: view })).toEqual({
    type: "upsert",
    workspace: view,
  });
  expect(decodeWorkspaceFrame({ type: "remove", workspaceId: "ws" })).toEqual({
    type: "remove",
    workspaceId: "ws",
  });
  expect(decodeWorkspaceFrame({ type: "order", workspaceIds: ["ws"] })).toEqual({
    type: "order",
    workspaceIds: ["ws"],
  });
  expect(decodeWorkspaceFrame({ type: "archived", archivedSessionIds: ["s2"] })).toEqual({
    type: "archived",
    archivedSessionIds: ["s2"],
  });
  expect(decodeWorkspaceFrame({ type: "pinned", pinnedSessionIds: [] })).toEqual({
    type: "pinned",
    pinnedSessionIds: [],
  });
});

test("a malformed frame is a rejection, not a half-applied state", () => {
  const cases: unknown[] = [
    null,
    [],
    { type: "nope" },
    { type: "upsert", workspace: { ...view, sessionIds: "s1" } },
    { type: "baseline", value: { ...baseline, items: [{ ...view, path: 7 }] } },
    { type: "remove" },
    { type: "pinned", pinnedSessionIds: [1] },
  ];
  for (const value of cases) {
    expect(() => decodeWorkspaceFrame(value)).toThrow(WorkspaceFrameError);
  }
});
