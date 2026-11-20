import { expect, test } from "nsh/test";

import type { SessionRow } from "../../features/dialogue/session/runtime";
import {
  attentionCount,
  attentionEvents,
  attentionStatuses,
  notificationText,
  sessionFromNotification,
  NOTIFICATION_PREFIX,
} from "./attention";

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "s1",
    botId: "bot",
    botName: "Ada",
    workspacePath: "/work/dsh-bot",
    label: "First run",
    detail: "Ada · /work/dsh-bot",
    updatedAt: null,
    missing: false,
    running: false,
    unread: false,
    attention: false,
    ...overrides,
  };
}

test("a reply that lands is one notification, and does not repeat", () => {
  const before = new Map([["s1", { running: true, unread: false, attention: false }]]);
  const after = [row({ unread: true })];
  const events = attentionEvents(before, after, { focused: false, visibleSessionIds: new Set() });
  expect(events).toEqual([{ sessionId: "s1", kind: "reply" }]);
  // The next tick sees the unread mark and stays quiet.
  expect(
    attentionEvents(attentionStatuses(after), after, {
      focused: false,
      visibleSessionIds: new Set(),
    }),
  ).toEqual([]);
});

test("a Session in front of a focused window is watched; another is not", () => {
  const before = new Map<string, { running: boolean; unread: boolean; attention: boolean }>();
  const rows = [row({ unread: true }), row({ id: "s2", unread: true })];
  const events = attentionEvents(before, rows, {
    focused: true,
    visibleSessionIds: new Set(["s1"]),
  });
  expect(events).toEqual([{ sessionId: "s2", kind: "reply" }]);
  // The same rows with the window unfocused notify for both.
  expect(
    attentionEvents(before, rows, { focused: false, visibleSessionIds: new Set(["s1"]) }),
  ).toHaveLength(2);
});

test("an approval outranks a reply in the same tick", () => {
  const before = new Map([["s1", { running: true, unread: false, attention: false }]]);
  const events = attentionEvents(before, [row({ attention: true, unread: true })], {
    focused: false,
    visibleSessionIds: new Set(),
  });
  expect(events).toEqual([{ sessionId: "s1", kind: "approval" }]);
});

test("the badge counts Sessions with unread replies or approvals", () => {
  expect(
    attentionCount([row(), row({ id: "s2", running: true }), row({ id: "s3", unread: true })]),
  ).toBe(1);
  expect(
    attentionCount([row({ unread: true }), row({ id: "s2", attention: true }), row({ id: "s3" })]),
  ).toBe(2);
});

test("a notification names the Bot and the reason", () => {
  expect(notificationText(row(), "reply")).toEqual({ title: "Ada", body: "replied" });
  expect(notificationText(row(), "approval")).toEqual({
    title: "Ada",
    body: "is waiting for approval",
  });
  // A Session without a Bot name still says something a person can read.
  expect(notificationText(row({ botName: "" }), "reply").title).toBe("dsh-bot");
});

test("only a notification of ours names a Session", () => {
  expect(sessionFromNotification(`${NOTIFICATION_PREFIX}s1`)).toBe("s1");
  expect(sessionFromNotification("other:s1")).toBe(null);
  expect(sessionFromNotification(NOTIFICATION_PREFIX)).toBe(null);
});
