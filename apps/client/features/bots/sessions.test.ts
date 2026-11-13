import { expect, test } from "nsh/test";

import { t } from "../../lib/i18n";
import { workspaceProjection, workspaceRow } from "../../test/workspaces";
import { claimSegment, createBot, createTemplate, emptyRegistry, initializeBot } from "./model";
import {
  conversationOf,
  currentSegmentOf,
  listProductSessions,
  sessionLabel,
  titleFromPrompt,
  workingDirectoryOf,
} from "./sessions";

/** One Workspace "/work" and a second "/other"; segments may span both. */
const WORKS = workspaceProjection({
  rows: [
    workspaceRow({ id: "ws-work", path: "/work", title: "work", sessionIds: ["new", "old"] }),
    workspaceRow({ id: "ws-other", path: "/other", title: "other", sessionIds: ["third"] }),
  ],
});

function readyBot() {
  let registry = initializeBot(
    createBot(
      createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
      { name: "Ada", templateId: "tmpl" },
      "bot",
    ),
    "bot",
  );
  registry = claimSegment(registry, "bot", "old", "ws-work");
  return claimSegment(registry, "bot", "new", "ws-work");
}

test("product sessions keep the long conversation's order, and missing claims last", () => {
  const registry = readyBot();
  const rows = listProductSessions(
    registry,
    [
      { sessionId: "old", blank: false, updatedAt: 10 },
      { sessionId: "new", blank: true, updatedAt: 20 },
    ],
    WORKS,
  );
  expect(rows.map((row) => row.sessionId)).toEqual(["old", "new"]);
  expect(rows[0]?.botId).toBe("bot");
  expect(rows[0]?.workspacePath).toBe("/work");
  const missing = listProductSessions(
    registry,
    [{ sessionId: "new", blank: true, updatedAt: 20 }],
    WORKS,
    { botId: "bot" },
  );
  expect(missing.map((row) => row.sessionId)).toEqual(["old", "new"]);
  expect(missing[0]?.missing).toBe(true);
  expect(
    listProductSessions(registry, null, WORKS, { botId: "bot" }).every((row) => !row.missing),
  ).toBe(true);
});

test("a session label uses the segment title, then a transient summary", () => {
  expect(sessionLabel({ title: "修复登录" }, "忽略")).toBe("修复登录");
  expect(sessionLabel({ title: null }, "  第一句话  ")).toBe("第一句话");
  expect(sessionLabel({ title: null }, null)).toBe(t("facts.untitledContext"));
});

test("an unnamed Session takes its title from the first prompt's first sentence", () => {
  expect(titleFromPrompt("Fix the login form. Then run the tests.")).toBe("Fix the login form");
  expect(titleFromPrompt("  many   spaces\nand lines ")).toBe("many spaces and lines");
  expect(titleFromPrompt("")).toBe("");
  expect(titleFromPrompt("x".repeat(80)).length).toBe(40);
});

test("the current segment is the last one, and the working directory follows it", () => {
  let registry = readyBot();
  const current = currentSegmentOf({ registry, workspaces: WORKS, botId: "bot" });
  expect(current?.segment.sessionId).toBe("new");
  expect(current?.workspacePath).toBe("/work");
  expect(workingDirectoryOf(registry, WORKS, "bot")).toBe("/work");

  registry = claimSegment(registry, "bot", "third", "ws-other");
  expect(currentSegmentOf({ registry, workspaces: WORKS, botId: "bot" })?.segment.sessionId).toBe(
    "third",
  );
  expect(workingDirectoryOf(registry, WORKS, "bot")).toBe("/other");
});

test("the conversation keeps every segment, including one dsh archived", () => {
  const registry = readyBot();
  const segments = conversationOf(
    registry,
    workspaceProjection({
      rows: WORKS.rows,
      archived: ["old"],
    }),
    [
      { sessionId: "old", blank: false, updatedAt: 10 },
      { sessionId: "new", blank: false, updatedAt: 20 },
    ],
    "bot",
  );
  expect(segments.map((segment) => segment.sessionId)).toEqual(["old", "new"]);
  expect(segments[0]?.current).toBe(false);
  expect(segments[1]?.current).toBe(true);
  expect(segments[0]?.path).toBe("/work");
});
