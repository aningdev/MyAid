import { expect, test } from "nsh/test";

import { workspaceProjection, workspaceRow } from "../../../test/workspaces";
import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
} from "../../bots/model";
import { buildSessionRoster, sessionDetail, withStatuses, type SessionRow } from "./roster";

/** The Dialogue's Workspace: path "/work", Session order old then new. */
const WORKS = workspaceProjection({
  rows: [workspaceRow({ id: "ws-work", path: "/work", title: "work", sessionIds: ["old", "new"] })],
});

function readyBot() {
  return claimSession(
    claimSession(
      createDialogue(
        initializeBot(
          createBot(
            createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
            { name: "Ada", templateId: "tmpl" },
            "bot",
          ),
          "bot",
        ),
        { botId: "bot", workspaceId: "ws-work" },
        "dlg",
      ),
      "dlg",
      "old",
    ),
    "dlg",
    "new",
  );
}

test("roster marks missing claims and Host-reported running", () => {
  const registry = readyBot();
  const rows = buildSessionRoster({
    registry,
    listed: [
      { sessionId: "new", blank: true, updatedAt: 20, running: true },
      { sessionId: "old", blank: false, updatedAt: 10, running: false },
    ],
    workspaces: WORKS,
    scopeBotId: "bot",
    summaries: new Map([["new", "修复登录"]]),
  });
  expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  expect(rows[0]?.dialogueId).toBe("dlg");
  expect(rows[0]?.workspacePath).toBe("/work");
  expect(rows[0]?.running).toBe(true);
  expect(rows[0]?.label).toBe("修复登录");
  expect(rows[0]?.unread).toBe(false);
  expect(rows[0]?.attention).toBe(false);
  expect(rows[1]?.running).toBe(false);
});

test("a controller's status wins over the listing and carries unread / attention", () => {
  const registry = readyBot();
  const rows = buildSessionRoster({
    registry,
    listed: [{ sessionId: "new", blank: false, updatedAt: 20, running: true }],
    workspaces: WORKS,
    summaries: new Map(),
  });
  const decorated = withStatuses(
    rows,
    new Map([
      ["new", { running: false, unread: true, attention: true }],
      ["old", { running: true, unread: false, attention: false }],
    ]),
  );
  expect(decorated[0]).toMatchObject({ running: false, unread: true, attention: true });
  expect(decorated[0]?.detail).not.toContain("执行中");
  expect(decorated[1]).toMatchObject({ running: true, unread: false, attention: false });
});

test("missing claims are marked and never running", () => {
  const registry = readyBot();
  const rows = buildSessionRoster({
    registry,
    listed: [{ sessionId: "new", blank: false, updatedAt: 20 }],
    workspaces: WORKS,
    summaries: new Map(),
  });
  expect(rows.find((row) => row.id === "old")?.missing).toBe(true);
  expect(rows.find((row) => row.id === "old")?.running).toBe(false);
});

test("scopeDialogueId filters to one Dialogue", () => {
  const registry = readyBot();
  const rows = buildSessionRoster({
    registry,
    listed: null,
    workspaces: WORKS,
    scopeDialogueId: "dlg",
    summaries: new Map(),
  });
  expect(rows.every((row) => row.dialogueId === "dlg")).toBe(true);
});

test("unclaimed sessions never appear", () => {
  const registry = readyBot();
  const rows = buildSessionRoster({
    registry,
    listed: [
      { sessionId: "new", blank: false, updatedAt: 1 },
      { sessionId: "stranger", blank: false, updatedAt: 99 },
    ],
    workspaces: WORKS,
    scopeBotId: null,
    summaries: new Map(),
  });
  expect(rows.every((row) => row.id !== "stranger")).toBe(true);
});

test("sessionDetail names the running state", () => {
  const detail = sessionDetail({ botName: "Ada", missing: false, workspacePath: "/work" }, true);
  expect(detail).toContain("执行中");
});

test("withStatuses leaves un-followed rows as the listing reported them", () => {
  const row: SessionRow = {
    id: "a",
    dialogueId: "dlg",
    botId: "bot",
    botName: "Ada",
    workspacePath: "/work",
    label: "a",
    detail: sessionDetail({ botName: "Ada", missing: false, workspacePath: "/work" }, true),
    missing: false,
    running: true,
    unread: false,
    attention: false,
  };
  expect(withStatuses([row], new Map())[0]).toMatchObject({
    running: true,
    unread: false,
    attention: false,
  });
});
