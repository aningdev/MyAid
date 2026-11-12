import { expect, test } from "nsh/test";

import {
  assistantParts,
  buildRows,
  groupsSteps,
  stepsLabel,
  toggleKey,
  toolDisplayState,
  toolSummary,
  type Row,
} from "./rows";
import type { Msg, Tool } from "./scripts";

type Assistant = Extract<Msg, { kind: "assistant" }>;

const NOW = new Date(2026, 2, 12, 15, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

function user(id: string, text: string, at?: number): Msg {
  return { kind: "user", id, text, ...(at === undefined ? {} : { at }) };
}

function reply(id: string, overrides: Partial<Assistant> = {}): Assistant {
  return {
    kind: "assistant",
    id,
    model: "Deep",
    script: "dsh",
    tools: [],
    md: "",
    status: "done",
    ...overrides,
  };
}

function tool(id: string, overrides: Partial<Tool> = {}): Tool {
  return {
    id,
    kind: "generic",
    state: "done",
    name: "read_file",
    arguments: '{"path":"/work/a.ts"}',
    ...overrides,
  };
}

test("day separators sit before the first message of each day", () => {
  const rows = buildRows({
    messages: [
      user("u1", "yesterday", NOW - DAY),
      reply("a2", { at: NOW - DAY }),
      user("u3", "today", NOW),
      reply("a4", { at: NOW }),
    ],
    liveId: null,
    running: false,
    since: null,
    now: NOW,
  });
  expect(rows.map((row) => row.kind)).toEqual([
    "date",
    "user",
    "assistant",
    "date",
    "user",
    "assistant",
  ]);
  const dates = rows.filter((row): row is Extract<Row, { kind: "date" }> => row.kind === "date");
  expect(dates.map((row) => row.label)).toEqual(["Yesterday", "Today"]);
});

test("a message without a time gets no separator", () => {
  const rows = buildRows({
    messages: [user("u1", "no time"), reply("a2")],
    liveId: "a2",
    running: true,
    since: NOW,
    now: NOW,
  });
  expect(rows.map((row) => row.kind)).toEqual(["user", "assistant", "working"]);
  expect(rows[1]).toMatchObject({ kind: "assistant", streaming: true });
  expect(rows[2]).toMatchObject({ kind: "working", since: NOW });
});

test("the reply being written is the one flagged as streaming", () => {
  const rows = buildRows({
    messages: [reply("a1"), reply("a2")],
    liveId: "a2",
    running: true,
    since: NOW,
    now: NOW,
  });
  const assistants = rows.filter(
    (row): row is Extract<Row, { kind: "assistant" }> => row.kind === "assistant",
  );
  expect(assistants.map((row) => row.streaming)).toEqual([false, true]);
});

test("a reply's parts come as thinking, then steps, then text", () => {
  const parts = assistantParts(
    reply("a1", {
      reasoning: { text: "think", seconds: 4, open: false },
      tools: [tool("t1"), tool("t2")],
      md: "hello",
    }),
  );
  expect(parts.map((part) => part.kind)).toEqual(["thinking", "steps", "text"]);
  expect(groupsSteps([tool("t1"), tool("t2")])).toBe(true);
  expect(groupsSteps([tool("t1")])).toBe(false);
  expect(stepsLabel([tool("t1")])).toBe("1 step");
  expect(stepsLabel([tool("t1"), tool("t2"), tool("t3")])).toBe("3 steps");
});

test("a streaming reply with no words yet has no text part", () => {
  expect(assistantParts(reply("a1"), true).map((part) => part.kind)).toEqual([]);
  expect(assistantParts(reply("a1"), false).map((part) => part.kind)).toEqual(["text"]);
});

test("a tool row's state tells failure and cutoff apart", () => {
  expect(toolDisplayState(tool("t1", { state: "running" }))).toBe("running");
  expect(toolDisplayState(tool("t1", { state: "pending" }))).toBe("pending");
  expect(toolDisplayState(tool("t1"))).toBe("done");
  expect(toolDisplayState(tool("t1", { isError: true }))).toBe("failed");
  expect(toolDisplayState(tool("t1", { state: "cancelled" }))).toBe("cut");
});

test("a tool's target is the first useful string in its arguments", () => {
  expect(
    toolSummary(tool("t1", { name: "read_file", arguments: '{"path":"/work/a.ts"}' })),
  ).toEqual({ verb: "read_file", target: "/work/a.ts" });
  // Arguments still streaming, or not JSON, read as written.
  expect(toolSummary(tool("t1", { name: "grep", arguments: '{"pattern":"ans' })).target).toBe(
    '{"pattern":"ans',
  );
  expect(toolSummary(tool("t1", { name: "run", arguments: "" })).target).toBe("");
});

test("toggling an expansion key returns a new set", () => {
  const empty: ReadonlySet<string> = new Set();
  const opened = toggleKey(empty, "a1:steps");
  expect([...opened]).toEqual(["a1:steps"]);
  expect([...toggleKey(opened, "a1:steps")]).toEqual([]);
  expect([...empty]).toEqual([]);
});
