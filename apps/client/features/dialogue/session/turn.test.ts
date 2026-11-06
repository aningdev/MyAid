import type { SessionFollowFrame } from "@myaid/dsh-web-protocol/session";
import { expect, test } from "nsh/test";

import { TurnProjection } from "./turn";

function frame(value: unknown): SessionFollowFrame {
  return value as SessionFollowFrame;
}

function userMessage(seq: number, text: string) {
  return frame({
    type: "event",
    event: {
      seq,
      type: "user/message",
      data: { content: text, source: { kind: "user" } },
    },
  });
}

function turnStart(seq: number) {
  return frame({ type: "event", event: { seq, type: "turn/start", data: {} } });
}

function streamChunk(text: string) {
  return frame({
    type: "assistant-stream",
    frame: { type: "chunk", chunk: { type: "text-delta", text } },
  });
}

function streamStart(attemptId = "a1") {
  return frame({ type: "assistant-stream", frame: { type: "start", attemptId } });
}

function streamEnd(attemptId = "a1") {
  return frame({ type: "assistant-stream", frame: { type: "end", attemptId } });
}

function assistantMessage(seq: number, text: string, tools: unknown[] = []) {
  const content: unknown[] = [{ type: "text", text }];
  for (const tool of tools) content.push(tool);
  return frame({
    type: "event",
    event: {
      seq,
      type: "assistant/message",
      data: { message: { content } },
    },
  });
}

function turnEnd(seq: number, kind: "completed" | "interrupted" | "error" = "completed") {
  return frame({
    type: "event",
    event: {
      seq,
      type: "turn/end",
      data: {
        reason: kind === "error" ? { kind: "error", error: { message: "boom" } } : { kind },
      },
    },
  });
}

function toolCall(id: string, name: string) {
  return { type: "tool-call", id, name, arguments: "{}" };
}

test("stream then complete freezes after a local turn", () => {
  const turns = new TurnProjection();
  turns.beginTurn("local-1");
  expect(turns.receive(userMessage(1, "hi")).pendingFreeze).toBe(null);
  expect(turns.receive(turnStart(2)).pendingFreeze).toBe(null);
  turns.receive(streamStart());
  const mid = turns.receive(streamChunk("hello "));
  expect(mid.liveMd).toBe("hello ");
  expect(mid.pendingFreeze).toBe(null);
  turns.receive(streamChunk("world"));
  turns.receive(streamEnd());
  turns.receive(assistantMessage(3, "hello world"));
  const done = turns.receive(turnEnd(4));
  expect(done.pendingFreeze?.status).toBe("done");
  expect(done.pendingFreeze?.messages.some((m) => m.kind === "assistant")).toBe(true);
  turns.acknowledgeFreeze();
  expect(turns.snapshot().pendingFreeze).toBe(null);
});

test("cancel marks freeze stopped without waiting for turn/end", () => {
  const turns = new TurnProjection();
  turns.beginTurn("local-2");
  turns.receive(turnStart(1));
  turns.receive(streamStart());
  turns.receive(streamChunk("partial"));
  const cancelled = turns.cancel();
  expect(cancelled.pendingFreeze?.status).toBe("stopped");
});

test("multi tool stream keeps tools on the live view until freeze", () => {
  const turns = new TurnProjection();
  turns.beginTurn("local-3");
  turns.receive(turnStart(1));
  turns.receive(streamStart());
  turns.receive(
    frame({
      type: "assistant-stream",
      frame: {
        type: "tool-call-chunks",
        id: "t1",
        name: "search",
        args: ['{"q":"x"}'],
      },
    }),
  );
  const live = turns.snapshot();
  expect(live.liveTools.map((t) => ("name" in t ? t.name : ""))).toContain("search");
  turns.receive(assistantMessage(2, "done", [toolCall("t1", "search")]));
  const done = turns.receive(turnEnd(3));
  expect(done.pendingFreeze?.status).toBe("done");
  const assistant = done.pendingFreeze?.messages.find((m) => m.kind === "assistant");
  expect(assistant && assistant.kind === "assistant" && assistant.tools.length).toBeTruthy();
});

test("idle snapshot without a local turn does not freeze", () => {
  const turns = new TurnProjection();
  turns.receive(userMessage(1, "prior"));
  turns.receive(assistantMessage(2, "prior reply"));
  const snap = turns.receive(turnEnd(3));
  expect(snap.pendingFreeze).toBe(null);
  expect(snap.messages.length).toBeGreaterThan(0);
});
