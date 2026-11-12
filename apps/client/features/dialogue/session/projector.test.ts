import type { SessionFollowFrame } from "@myaid/dsh-web-protocol/session";
import { expect, test } from "nsh/test";

import { SessionProjector } from "./projector";

function frame(value: unknown): SessionFollowFrame {
  return value as SessionFollowFrame;
}

function event(seq: number, type: string, data: unknown, time = 1_000 + seq) {
  return { type: "event", event: { seq, type, time, data } };
}

test("a snapshot reports whether older history exists", () => {
  const projector = new SessionProjector();
  const snap = projector.receive(
    frame({
      type: "snapshot",
      hasMore: true,
      records: [event(10, "user/message", { content: "newer" })],
    }),
  );
  expect(snap.olderHasMore).toBe(true);
  expect(projector.firstSeq()).toBe(10);
});

test("messages carry the time dsh recorded them", () => {
  const projector = new SessionProjector();
  const snap = projector.receive(
    frame({
      type: "snapshot",
      hasMore: false,
      records: [
        event(1, "user/message", { content: "hi" }, 1_700_000_000_000),
        event(
          2,
          "assistant/message",
          { message: { content: [{ type: "text", text: "hello" }] } },
          1_700_000_001_000,
        ),
      ],
    }),
  );
  expect(snap.messages.map((message) => message.at)).toEqual([
    1_700_000_000_000, 1_700_000_001_000,
  ]);
});

test("a page before the window lands above it, in order", () => {
  const projector = new SessionProjector();
  projector.receive(
    frame({
      type: "snapshot",
      hasMore: true,
      records: [event(10, "user/message", { content: "newer" })],
    }),
  );
  const chat = projector.prepend(
    [
      event(4, "user/message", { content: "older" }),
      event(5, "assistant/message", { message: { content: [{ type: "text", text: "answer" }] } }),
    ],
    false,
  );
  expect(chat.messages.length).toBe(3);
  expect(chat.messages[0]).toMatchObject({ kind: "user", text: "older" });
  expect(chat.olderHasMore).toBe(false);
  expect(projector.firstSeq()).toBe(4);
});
