import { expect, test } from "nsh/test";

import { claimSession, createBot, createTemplate, emptyRegistry, initializeBot } from "./model";
import { listProductSessions, sessionLabel } from "./sessions";

function readyBot() {
  const registry = initializeBot(
    createBot(
      createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
      { name: "Ada", templateId: "tmpl", workspace: "/work" },
      "bot",
    ),
    "bot",
  );
  return claimSession(claimSession(registry, "bot", "old"), "bot", "new");
}

test("product sessions sort by dsh time and leave missing claims last", () => {
  const registry = readyBot();
  const rows = listProductSessions(
    registry,
    [
      { sessionId: "old", blank: false, updatedAt: 10 },
      { sessionId: "new", blank: true, updatedAt: 20 },
    ],
    null,
  );
  expect(rows.map((row) => row.sessionId)).toEqual(["new", "old"]);
  const missing = listProductSessions(
    registry,
    [{ sessionId: "new", blank: true, updatedAt: 20 }],
    "bot",
  );
  expect(missing.map((row) => row.sessionId)).toEqual(["new", "old"]);
  expect(missing[1]?.missing).toBe(true);
  expect(listProductSessions(registry, null, "bot").every((row) => !row.missing)).toBe(true);
});

test("a session label uses the claim title, then a transient summary", () => {
  expect(sessionLabel({ title: "修复登录" }, "忽略")).toBe("修复登录");
  expect(sessionLabel({ title: null }, "  第一句话  ")).toBe("第一句话");
  expect(sessionLabel({ title: null }, null)).toBe("未命名任务");
});
