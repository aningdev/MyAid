import type { SessionEventLikeEntry, SessionEventWindow } from "@myaid/dsh-web-protocol/client";
import { expect, test } from "nsh/test";

import { assistantMessage, durable, liveChunk, userMessage } from "../../../test/sessions";
import type { Msg } from "../chat/scripts";
import { freezeMessages, TurnProjection } from "./turn";

/** The official window a recording helper keeps, one revision per call. */
class Window {
  entries: SessionEventLikeEntry[] = [];
  hasMore = false;
  revision = 0;
  change: SessionEventWindow["change"] = { kind: "replace", entries: [] };

  private publish(change: SessionEventWindow["change"]): SessionEventWindow {
    this.revision += 1;
    this.change = change;
    return {
      entries: this.entries,
      hasMore: this.hasMore,
      revision: this.revision,
      change,
    };
  }

  replace(entries: readonly SessionEventLikeEntry[], hasMore = false): SessionEventWindow {
    this.entries = [...entries];
    this.hasMore = hasMore;
    return this.publish({ kind: "replace", entries });
  }

  append(entry: SessionEventLikeEntry): SessionEventWindow {
    this.entries = [...this.entries, entry];
    return this.publish({ kind: "append", entries: [entry] });
  }
}

function turnEnd(seq: number, kind: "completed" | "interrupted" | "error" = "completed") {
  return durable(seq, "turn/end", {
    reason: kind === "error" ? { kind: "error", error: { message: "boom" } } : { kind },
  });
}

function toolCall(id: string, name: string) {
  return { type: "tool-call", id, name, arguments: "{}" };
}

test("stream then complete freezes after a local turn", () => {
  const turns = new TurnProjection();
  const window = new Window();
  turns.beginTurn("local-1");
  expect(turns.apply(window.replace([userMessage(1, "hi")]), false).pendingFreeze).toBe(null);
  expect(turns.apply(window.append(durable(2, "turn/start")), true).pendingFreeze).toBe(null);
  const mid = turns.apply(window.append(liveChunk(3, "a1", "hello ")), true);
  expect(mid.liveMd).toBe("hello ");
  expect(mid.pendingFreeze).toBe(null);
  turns.apply(window.append(liveChunk(4, "a1", "world")), true);
  // The turn settles: the durable reply replaces the live rows.
  const committed = turns.apply(
    window.replace([userMessage(1, "hi"), assistantMessage(5, "hello world")]),
    false,
  );
  expect(committed.pendingFreeze?.status).toBe("done");
  const done = turns.apply(window.append(turnEnd(6)), false);
  expect(done.pendingFreeze?.status).toBe("done");
  expect(done.pendingFreeze?.messages.some((m) => m.kind === "assistant")).toBe(true);
  turns.acknowledgeFreeze();
  expect(turns.snapshot().pendingFreeze).toBe(null);
});

test("cancel marks freeze stopped without waiting for turn/end", () => {
  const turns = new TurnProjection();
  const window = new Window();
  turns.beginTurn("local-2");
  turns.apply(window.replace([durable(1, "turn/start")]), true);
  turns.apply(window.append(liveChunk(2, "a1", "partial")), true);
  const cancelled = turns.cancel();
  expect(cancelled.pendingFreeze?.status).toBe("stopped");
});

test("tools stay on the live view until freeze", () => {
  const turns = new TurnProjection();
  const window = new Window();
  turns.beginTurn("local-3");
  turns.apply(window.replace([durable(1, "turn/start")]), true);
  turns.apply(window.append(userMessage(2, "x") as never), true);
  turns.apply(
    window.append({
      type: "transient",
      event: {
        type: "assistant/live-chunk",
        seq: 3,
        time: 1,
        data: {
          attemptId: "a1",
          turn: 1,
          step: 1,
          chunk: {
            type: "tool-call-delta",
            id: "t1",
            name: "search",
            argumentsDelta: '{"q":"x"}',
          },
        },
      },
    } as unknown as SessionEventLikeEntry),
    true,
  );
  const live = turns.snapshot();
  expect(live.liveTools.map((t) => ("name" in t ? t.name : ""))).toContain("search");
  turns.apply(
    window.append(
      durable(4, "assistant/message", {
        message: { content: [{ type: "text", text: "done" }, toolCall("t1", "search")] },
      }),
    ),
    true,
  );
  const done = turns.apply(window.append(turnEnd(5)), false);
  expect(done.pendingFreeze?.status).toBe("done");
  const assistant = done.pendingFreeze?.messages.find((m) => m.kind === "assistant");
  expect(assistant && assistant.kind === "assistant" && assistant.tools.length).toBeTruthy();
});

test("a completed turn is committed once, a stopped one keeps its live reply", () => {
  const asked: Msg = { kind: "user", id: "u1", text: "hi" };
  const reply: Msg = {
    kind: "assistant",
    id: "a2",
    model: "Deep",
    script: "dsh",
    tools: [],
    md: "hello",
    status: "done",
  };
  const live: Msg = { ...reply, id: "m1" };

  // dsh recorded the reply: appending the pane's copy would show it twice.
  expect(freezeMessages([asked, reply], live)).toEqual([asked, reply]);
  // A stopped turn kept the user's message alone: its live reply comes after.
  expect(freezeMessages([asked], live)).toEqual([asked, live]);
  expect(freezeMessages([asked], null)).toEqual([asked]);
});

test("idle window without a local turn does not freeze", () => {
  const turns = new TurnProjection();
  const window = new Window();
  turns.apply(window.replace([userMessage(1, "prior"), assistantMessage(2, "prior reply")]), false);
  const snap = turns.apply(window.append(turnEnd(3)), false);
  expect(snap.pendingFreeze).toBe(null);
  expect(snap.messages.length).toBeGreaterThan(0);
});

test("a turn only the log reports still settles the local bubble", () => {
  const turns = new TurnProjection();
  const window = new Window();
  const requestId = "req-1";
  turns.beginTurn("local-4", requestId);
  turns.apply(window.replace([]), false);
  // The prompt was admitted and the turn finished while the pane saw nothing.
  const done = turns.apply(
    window.replace([userMessage(1, "hi", requestId), assistantMessage(2, "answer"), turnEnd(3)]),
    false,
  );
  expect(done.pendingFreeze?.status).toBe("done");
  expect(done.messages.map((message) => message.kind)).toEqual(["user", "assistant"]);
});
