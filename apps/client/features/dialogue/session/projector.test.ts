import type { SessionEventLikeEntry, SessionEventWindow } from "@dsh-bot/dsh-web-protocol/client";
import { expect, test } from "nsh/test";

import { assistantMessage, durable, liveChunk, userMessage } from "../../../test/sessions";
import { SessionProjector } from "./projector";

/** One replaced window at revision `revision`. */
function replaced(
  revision: number,
  entries: readonly SessionEventLikeEntry[],
  hasMore = false,
): SessionEventWindow {
  return { entries, hasMore, revision, change: { kind: "replace", entries } };
}

/** One appended entry at revision `revision`. */
function appended(revision: number, entry: SessionEventLikeEntry): SessionEventWindow {
  return {
    entries: [entry],
    hasMore: false,
    revision,
    change: { kind: "append", entries: [entry] },
  };
}

test("the window reports whether older history exists", () => {
  const projector = new SessionProjector();
  projector.apply(replaced(1, [userMessage(10, "newer")], true));
  const snap = projector.snapshot();
  expect(snap.olderHasMore).toBe(true);
  expect(projector.lastSeq()).toBe(10);
});

test("messages carry the time dsh recorded them", () => {
  const projector = new SessionProjector();
  const at = (seq: number) => 1_700_000_000_000 + seq * 1_000;
  const entries = [
    {
      type: "event",
      event: { seq: 1, type: "user/message", time: at(1), data: { content: "hi" } },
    },
    {
      type: "event",
      event: {
        seq: 2,
        type: "assistant/message",
        time: at(2),
        data: { message: { content: [{ type: "text", text: "hello" }] } },
      },
    },
  ] as unknown as SessionEventLikeEntry[];
  projector.apply(replaced(1, entries));
  expect(projector.snapshot().messages.map((message) => message.at)).toEqual([at(1), at(2)]);
});

test("a page prepended above the window lands in order", () => {
  const projector = new SessionProjector();
  projector.apply(replaced(1, [userMessage(10, "newer")], true));
  projector.apply({
    entries: [userMessage(4, "older"), assistantMessage(5, "answer"), userMessage(10, "newer")],
    hasMore: false,
    revision: 2,
    change: {
      kind: "prepend",
      entries: [userMessage(4, "older"), assistantMessage(5, "answer")],
    },
  });
  const chat = projector.snapshot();
  expect(chat.messages.length).toBe(3);
  expect(chat.messages[0]).toMatchObject({ kind: "user", text: "older" });
  expect(chat.olderHasMore).toBe(false);
  expect(projector.lastSeq()).toBe(10);
});

test("live chunks accumulate until the durable message settles them", () => {
  const projector = new SessionProjector();
  projector.apply(replaced(1, [userMessage(1, "hi")]));
  projector.apply(appended(2, liveChunk(2, "a1", "stream")));
  projector.apply(appended(3, liveChunk(3, "a1", "ing")));
  expect(projector.snapshot().liveMd).toBe("streaming");
  projector.apply({
    entries: [],
    hasMore: false,
    revision: 4,
    change: {
      kind: "settle-assistant",
      attemptId: "a1" as never,
      entry: assistantMessage(4, "streaming") as never,
    },
  });
  // The live rows are gone; the durable reply is what stays on screen.
  expect(projector.snapshot().liveMd).toBe("streaming");
});

test("deliverables come from the turn's presented files, one row per path", () => {
  const projector = new SessionProjector();
  projector.apply(
    replaced(1, [
      durable(1, "deliverables/presented", {
        turn: 1,
        files: [{ path: "report.md", description: "the report" }],
      }),
      durable(2, "deliverables/presented", { turn: 2, files: [{ path: "/work/slide.pdf" }] }),
      // A later declaration of the same file updates its note, not its row.
      durable(3, "deliverables/presented", {
        turn: 3,
        files: [{ path: "report.md", description: "final" }],
      }),
    ]),
  );
  expect(projector.snapshot().deliverables).toEqual([
    { path: "report.md", description: "final" },
    { path: "/work/slide.pdf" },
  ]);
});
