import { expect, test } from "nsh/test";

import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
} from "../../bots/model";
import { buildSessionRoster, sessionDetail, withOccupancy } from "./roster";

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
        { botId: "bot", workspacePath: "/work" },
        "dlg",
      ),
      "dlg",
      "old",
    ),
    "dlg",
    "new",
  );
}

test("roster marks missing claims and occupancy", () => {
  const registry = readyBot();
  const rows = buildSessionRoster({
    registry,
    listed: [{ sessionId: "new", blank: true, updatedAt: 20 }],
    scopeBotId: "bot",
    occupyingSessionId: "new",
    summaries: new Map([["new", "修复登录"]]),
  });
  expect(rows.map((row) => row.id)).toEqual(["new", "old"]);
  expect(rows[0]?.dialogueId).toBe("dlg");
  expect(rows[0]?.workspacePath).toBe("/work");
  expect(rows[0]?.running).toBe(true);
  expect(rows[0]?.label).toBe("修复登录");
  expect(rows[1]?.missing).toBe(true);
  expect(rows[1]?.detail).toContain("待核对");
  expect(rows[1]?.running).toBe(false);
});

test("scopeDialogueId filters to one Dialogue", () => {
  const registry = readyBot();
  const rows = buildSessionRoster({
    registry,
    listed: null,
    scopeDialogueId: "dlg",
    occupyingSessionId: null,
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
    scopeBotId: null,
    occupyingSessionId: null,
    summaries: new Map(),
  });
  expect(rows.every((row) => row.id !== "stranger")).toBe(true);
});

test("withOccupancy updates running detail", () => {
  const rows = withOccupancy(
    [
      {
        id: "a",
        dialogueId: "dlg",
        botId: "bot",
        botName: "Ada",
        workspacePath: "/work",
        label: "a",
        detail: sessionDetail(
          { botName: "Ada", archived: false, missing: false, workspacePath: "/work" },
          false,
        ),
        archived: false,
        missing: false,
        running: false,
      },
    ],
    "a",
  );
  expect(rows[0]?.running).toBe(true);
  expect(rows[0]?.detail).toContain("执行中");
});
