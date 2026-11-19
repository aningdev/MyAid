/**
 * One Bot's long conversation over the scripted transport in
 * `long-conversation-harness.tsx`: the current segment with its divider, older
 * segments loaded at the top, the history rail's jump, sending from a scrolled
 * position (always the latest segment), `/new`, and a directory change.
 */
import { expect, test } from "nsh/test";

import { open } from "../../test/open";

const desktop = { platform: "web" as const, width: 1200, height: 900 };
const composer = "id:composer";

async function conversation() {
  const app = await open("./long-conversation-harness.tsx", desktop);
  await app.waitFor("text:follow-up answer 19");
  return app;
}

/** Whether the reader is at the newest message: the edge hairline is hidden there. */
function atTheEnd(app: Awaited<ReturnType<typeof conversation>>): boolean {
  return (app.viewStyle("id:transcript-edge")?.effectiveOpacity ?? 1) < 0.5;
}

/** Reach the top a page at a time; each load re-renders above the viewport. */
async function scrollToTop(app: Awaited<ReturnType<typeof conversation>>) {
  for (let attempt = 0; attempt < 8; attempt++) {
    await app.scroll("id:transcript", -1200).catch(() => undefined);
    await app.wait(120);
    if (app.shows("text:the earlier answer")) return;
  }
}

test("the latest segment shows under its date · directory divider", async () => {
  const app = await conversation();
  expect(app.texts().some((text) => text.includes("/proj-b"))).toBe(true);
  expect(app.shows("id:history-rail")).toBe(true);
  expect(app.shows("id:history-mark-s1")).toBe(true);
  expect(app.shows("id:history-mark-s2")).toBe(true);
  // The current segment is the highlighted mark; an older one is not.
  expect(app.shows("id:history-current-s2")).toBe(true);
  expect(app.shows("id:history-current-s1")).toBe(false);
  // Only the latest segment is open until the person reaches the top.
  expect(app.shows("text:the earlier answer")).toBe(false);
});

test("hovering a mark shows the segment's title, time and directory on a card", async () => {
  const app = await conversation();
  await app.hover("id:history-mark-s1");
  await app.waitFor("id:rail-card", { timeout: 10000 });
  expect(app.shows("text:Earlier topic")).toBe(true);
  expect(app.shows("id:rail-card-time")).toBe(true);
  // The full path is on the mark's VoiceOver label; the card shows ~/… or the
  // path itself, shortened in the middle when it is long.
  expect(app.shows("id:history-mark-s1")).toBe(true);
  expect(app.texts().some((text) => text.includes("proj-a"))).toBe(true);
});

test("scrolling to the top loads the older segment above the current one", async () => {
  const app = await conversation();
  await scrollToTop(app);
  await app.waitFor("text:the earlier answer", { timeout: 10000 });
  expect(app.texts().some((text) => text.includes("/proj-a"))).toBe(true);
  expect(app.texts().some((text) => text.includes("/proj-b"))).toBe(true);
  expect(app.count("id:segment-divider")).toBe(2);
});

test("the history rail jumps to an older segment's start", async () => {
  const app = await conversation();
  // At the end, the transcript's edge wears its hairline at zero; away from it,
  // the hairline shows. A row's place in the scroll is not something a test can
  // read, so this is how the jump shows itself from where the reader stands.
  expect(atTheEnd(app)).toBe(true);
  await app.press("id:history-mark-s1");
  await app.waitFor("text:the earlier answer", { timeout: 10000 });
  expect(app.count("id:segment-divider")).toBe(2);
  await app.waitUntil(() => !atTheEnd(app), { timeout: 10000 });
});

test("a prompt sent while scrolled up still goes to the latest segment", async () => {
  const app = await conversation();
  await scrollToTop(app);
  await app.waitFor("text:the earlier answer", { timeout: 10000 });
  await app.type(composer, "hello from above");
  await app.press("label:Send");
  await app.waitUntil(
    () => app.texts().some((text) => text.includes("prompt:s2:hello from above")),
    { timeout: 10000 },
  );
  // No new segment: the rail still has the same two marks.
  expect(app.shows("id:history-mark-s1")).toBe(true);
  expect(app.shows("id:history-mark-s2")).toBe(true);
  expect(app.shows("id:history-mark-s3")).toBe(false);
});

test("`/new` starts a new segment and keeps the previous content above it", async () => {
  const app = await conversation();
  const before = app.count("id:segment-divider");
  await app.type(composer, "/new");
  await app.press("label:Send");
  await app.waitUntil(() => app.count("id:segment-divider") > before, { timeout: 10000 });
  // The previous segment's content is still in the transcript, above the new
  // segment's divider, and the current mark moved to the new segment.
  expect(app.texts().some((text) => text.includes("follow-up answer"))).toBe(true);
  expect(app.texts().filter((text) => text.includes("/proj-b")).length).toBeGreaterThan(0);
  expect(app.shows("id:history-current-s3")).toBe(true);
  expect(app.shows("id:history-current-s2")).toBe(false);
});

test("changing the working directory in the header starts a segment there", async () => {
  const app = await conversation();
  const before = app.count("id:segment-divider");
  await app.press("id:session-workspace");
  await app.waitFor("id:session-workspace-input");
  await app.clear("id:session-workspace-input");
  await app.type("id:session-workspace-input", "/proj-c");
  await app.press("label:Use this working directory");
  await app.waitUntil(
    () =>
      app.count("id:segment-divider") > before &&
      app.texts().some((text) => text.includes("/proj-c")),
    { timeout: 10000 },
  );
  // The new divider names the new directory (the header's path is not enough).
  expect(app.shows("text:· /proj-c")).toBe(true);
  // The old segment keeps its own: the rail still holds it, and jumping there
  // shows the old directory rather than the new one.
  expect(app.shows("id:history-mark-s2")).toBe(true);
  await app.press("id:history-mark-s2");
  await app.waitUntil(() => app.texts().some((text) => text.includes("/proj-b")), {
    timeout: 10000,
  });
});
