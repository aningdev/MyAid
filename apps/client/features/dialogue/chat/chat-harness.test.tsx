/**
 * The chat's transcript and composer, over the scripted transport in
 * `chat-harness.tsx`: following the newest message, tool steps, Stop keeping
 * what was written, a queued prompt, the per-Session draft, pasted files.
 */
import { expect, open, test } from "nsh/test";

const desktop = { platform: "web" as const, width: 1200, height: 900 };

const composer = "id:composer";

/** A 1 × 1 PNG, what a pasted screenshot holds. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);
const send = "label:Send";
const pill = "label:Jump to the latest message";

async function chat() {
  const app = await open("./chat-harness.tsx", desktop);
  await app.waitFor("text:Message Ada");
  return app;
}

test("the transcript follows the newest message until scrolled up", async () => {
  const app = await chat();

  await app.type(composer, "long thread");
  await app.press(send);
  await app.waitFor("text:Answer 17.");
  expect(app.shows(pill)).toBe(false);

  // Scrolled up, it stops following and offers the way back.
  await app.wait(400);
  expect(app.shows(pill)).toBe(false);
  await app.scroll("id:transcript", -900);
  await app.waitFor(pill);
  await app.press(pill);
  await app.waitUntil(() => !app.shows(pill));
});

test("tool calls group into steps and open on press", async () => {
  const app = await chat();

  await app.type(composer, "tools please");
  await app.press(send);
  await app.waitFor("text:3 steps");
  expect(app.texts()).toContain("Thought for 1s");
  expect(app.shows("text:read_file")).toBe(false);

  await app.press("label:3 steps, expand");
  await app.waitFor("text:read_file");
  await app.press("label:Tool read_file");
  await app.waitFor("text:result 0");
});

test("a very long reply renders and follows", async () => {
  const app = await chat();
  await app.type(composer, "huge reply");
  await app.press(send);
  await app.waitUntil(() => app.texts().some((text) => text.includes("Paragraph 159")), {
    timeout: 15000,
  });
});

test("a reply only a recovered snapshot reports settles the turn", async () => {
  const app = await chat();
  await app.type(composer, "replay please");
  await app.press(send);

  // The prompt was sent while the follow stream was away: the reply comes
  // with the recovered snapshot, never as a live frame.
  await app.waitFor("text:Replayed answer.");
  // The turn is over: no working row stays behind and nothing is left to jump to.
  expect(app.texts()).not.toContain("Working…");
  expect(app.shows(pill)).toBe(false);
});

test("Stop keeps the words shown so far", async () => {
  const app = await chat();

  await app.type(composer, "slow reply");
  await app.press(send);
  await app.waitFor("label:Stop generating");
  await app.press("label:Stop generating");

  await app.waitFor("text:Stopped");
  // The words it had written stay on screen.
  expect(app.texts().some((text) => text.startsWith("This"))).toBe(true);
  expect(app.shows("text:Stopped — the reply keeps what it wrote")).toBe(true);
  // The turn ended: the composer offers Send again.
  await app.waitFor(send);
});

test("a prompt sent while the turn runs is queued, and can be withdrawn", async () => {
  const app = await chat();

  await app.type(composer, "slow reply");
  await app.press(send);
  await app.waitUntil(() => app.texts().some((text) => text.startsWith("This reply")));

  await app.type(composer, "and one more");
  // Return sends while the turn runs: the Stop button keeps its place.
  await app.submit(composer);
  await app.waitFor("text:QUEUED");
  expect(app.shows("text:and one more")).toBe(true);

  await app.press("label:Withdraw the queued message");
  await app.waitUntil(() => !app.shows("text:QUEUED"));
});

test("the draft stays while Panels switch", async () => {
  const app = await chat();

  await app.type(composer, "half a thought");
  await app.press("label:Switch panel");
  // The other Session's composer has its own draft.
  await app.waitUntil(() => !app.shows("text:half a thought"));
  await app.press("label:Switch panel");
  await app.waitFor("text:half a thought");
});

test("a pasted image becomes a chip on the composer", async () => {
  const app = await open("./chat-harness.tsx", {
    ...desktop,
    // The headless runner has no filesystem: the app reads the pasted
    // `file:` URL's bytes through this stand-in instead.
    modules: {
      "fs/promises": {
        readFile: () => PNG,
        "default.readFile": () => PNG,
      },
    },
  });
  await app.waitFor("text:Message Ada");

  await app.paste(composer, { text: "", uris: ["file:///tmp/cat.png"] });
  await app.waitFor("label:Remove cat.png");
  expect(app.texts()).toContain("cat.png");

  await app.press("label:Remove cat.png");
  await app.waitUntil(() => !app.shows("text:cat.png"));

  // A drop of a local file lands as a chip too.
  await app.dropFiles("id:chat", ["file:///tmp/dropped-notes.md"]);
  await app.waitFor("label:Remove dropped-notes.md");
});
