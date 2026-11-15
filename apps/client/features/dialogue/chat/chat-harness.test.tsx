/**
 * The chat's transcript and composer, over the scripted transport in
 * `chat-harness.tsx`: following the newest message, tool steps, Stop keeping
 * what was written, a queued prompt, the per-Session draft, pasted files.
 */
import { expect, test } from "nsh/test";

import { graphical } from "../../../test/graphical";
import { open } from "../../../test/open";

const desktop = { platform: "web" as const, width: 1200, height: 900 };

const composer = "id:composer";

/** A 1 × 1 PNG, what a pasted screenshot holds. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (char) => char.charCodeAt(0),
);
/** The bytes a dropped or pasted document comes with. */
const NOTES = new TextEncoder().encode("# notes\n");
/** A read the app is not allowed to make, as `fs` refuses one. */
const denial = () => {
  throw Object.assign(new Error("not granted"), { code: "ERR_ACCESS_DENIED" });
};
const send = "label:Send";
const pill = "label:Jump to the latest message";

async function chat() {
  const app = await open("./chat-harness.tsx", desktop);
  await app.waitFor("text:Message Ada");
  return app;
}

/** `modules` stands in for native calls in a headless runner; a target rejects it. */
async function openHeadless(options: Parameters<typeof open>[1]) {
  try {
    return await open("./chat-harness.tsx", options);
  } catch (error) {
    if (String(error).includes("unsupported")) return null;
    throw error;
  }
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

test("a reply that has finished stops its script, so the transcript settles", async () => {
  const app = await chat();

  await app.type(composer, "hello");
  await app.press(send);
  // Three words at 120 ms, then the turn ends and Send comes back.
  await app.waitFor(send);
  const settled = app.texts();
  // Nothing appends after that: the script's timer stopped with its turn, so a
  // reply is said once rather than once per tick of a timer left running.
  await app.wait(1500);
  expect(app.texts()).toEqual(settled);
});

test("a slow reply says all its words and then waits, never repeating them", async () => {
  const app = await chat();

  await app.type(composer, "slow reply");
  await app.press(send);
  // Sixteen words at 300 ms: "says so." is the last of them.
  const reply = () => app.texts().find((text) => text.includes("says so."));
  await app.waitUntil(() => reply() !== undefined);
  const written = reply();
  // The script has said everything it has: no word lands twice (the elapsed
  // clock beside it may, which is what a running turn does).
  await app.wait(1200);
  expect(reply()).toBe(written);
  // The turn is still open for Stop to take, which is what this script is for.
  expect(app.shows("label:Stop generating")).toBe(true);
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

/** The headless runner has no filesystem: the app reads `file:` URLs through a stand-in. */
const readable = (bytes: Uint8Array) => ({
  readFile: () => bytes,
  "default.readFile": () => bytes,
});

test("the paperclip attaches the files the open dialog returns", async () => {
  const app = await chat();
  // `onPick` and the stand-ins below answer a headless runner's calls only.
  if (await graphical(app)) return;
  app.onPick(() => [{ name: "notes.md", type: "text/markdown", data: NOTES }]);

  await app.press("label:Attach files");
  await app.waitFor("label:Remove notes.md");
  expect(app.texts()).toContain("notes.md");
  expect(app.picks().length).toBe(1);
});

test("a pasted or dropped file the app may read lands as a chip", async () => {
  // The picker's bytes need no grant; a `file:` URL's do (`fs.read`), and
  // this stand-in is the grant the app has.
  const app = await openHeadless({
    ...desktop,
    modules: { "fs/promises": readable(PNG) },
  });
  if (!app) return;
  await app.waitFor("text:Message Ada");

  await app.paste(composer, { text: "", uris: ["file:///tmp/cat.png"] });
  await app.waitFor("label:Remove cat.png");
  expect(app.texts()).toContain("cat.png");

  await app.press("label:Remove cat.png");
  await app.waitUntil(() => !app.shows("text:cat.png"));

  // A drop of a local file lands as a chip too.
  await app.dropFiles("id:chat", ["file:///tmp/dropped-notes.md"]);
  await app.waitFor("label:Remove dropped-notes.md");
  // Read, so the dialog was never needed.
  expect(app.picks().length).toBe(0);
});

test("a dropped file the app cannot read comes through the open dialog", async () => {
  const app = await openHeadless({
    ...desktop,
    // A path outside `capabilities.fs.read`: nsh.json grants the app's data.
    modules: { "fs/promises": { readFile: denial, "default.readFile": denial } },
  });
  if (!app) return;
  await app.waitFor("text:Message Ada");
  app.onPick(() => [{ name: "dropped-notes.md", type: "text/markdown", data: NOTES }]);

  await app.dropFiles("id:chat", ["file:///tmp/dropped-notes.md"]);
  await app.waitFor("label:Remove dropped-notes.md");
  expect(app.picks().length).toBe(1);
  expect(app.picks()[0]?.kind).toBe("files");
});

test("a dropped file the app cannot read, with the dialog closed, says how to attach", async () => {
  const app = await openHeadless({
    ...desktop,
    modules: { "fs/promises": { readFile: denial, "default.readFile": denial } },
  });
  if (!app) return;
  await app.waitFor("text:Message Ada");
  app.onPick(() => null);

  await app.dropFiles("id:chat", ["file:///tmp/dropped-notes.md"]);
  await app.waitFor("text:Nothing was attached: MyAid reads local files through the open dialog.");
  expect(app.count("label:Remove dropped-notes.md")).toBe(0);
});
