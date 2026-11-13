import { expect, test } from "nsh/test";

import { t } from "../../../lib/i18n";
import { workspaceProjection, workspaceRow } from "../../../test/workspaces";
import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
} from "../../bots/model";
import { buildSessionRoster, sessionDetail, withStatuses, type SessionRow } from "./roster";

/** The conversation's Workspace: path "/work", segment order old then new. */
const WORKS = workspaceProjection({
  rows: [workspaceRow({ id: "ws-work", path: "/work", title: "work", sessionIds: ["old", "new"] })],
});

function readyBot() {
  return claimSegment(
    claimSegment(
      initializeBot(
        createBot(
          createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
          { name: "Ada", templateId: "tmpl" },
          "bot",
        ),
        "bot",
      ),
      "bot",
      "old",
      "ws-work",
    ),
    "bot",
    "new",
    "ws-work",
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
  // Registry order is the long conversation's order: oldest first.
  expect(rows.map((row) => row.id)).toEqual(["old", "new"]);
  expect(rows[1]?.workspacePath).toBe("/work");
  expect(rows[1]?.running).toBe(true);
  expect(rows[1]?.label).toBe("修复登录");
  expect(rows[1]?.unread).toBe(false);
  expect(rows[1]?.attention).toBe(false);
  expect(rows[0]?.running).toBe(false);
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
  expect(decorated[1]).toMatchObject({ running: false, unread: true, attention: true });
  expect(decorated[1]?.detail).not.toContain(t("session.status.running"));
  expect(decorated[0]).toMatchObject({ running: true, unread: false, attention: false });
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

test("scopeBotId filters to one Bot", () => {
  const registry = readyBot();
  const rows = buildSessionRoster({
    registry,
    listed: null,
    workspaces: WORKS,
    scopeBotId: "bot",
    summaries: new Map(),
  });
  expect(rows.every((row) => row.botId === "bot")).toBe(true);
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
  expect(detail).toContain(t("session.status.running"));
});

test("withStatuses leaves un-followed rows as the listing reported them", () => {
  const row: SessionRow = {
    id: "a",
    botId: "bot",
    botName: "Ada",
    workspacePath: "/work",
    label: "a",
    detail: sessionDetail({ botName: "Ada", missing: false, workspacePath: "/work" }, true),
    updatedAt: null,
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
