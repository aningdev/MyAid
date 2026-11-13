/**
 * Real-Host smoke for the official Session model: the Client no longer owns
 * follow, reconnect, paging or the receipt-to-queue-id plumbing, so this run
 * proves the official Client model carries them.
 *
 * 1. Two Panels stream at the same time, each into its own transcript.
 * 2. A queued prompt shows above the composer and is withdrawn by request id.
 * 3. An approval round-trips: dsh asks, the Panel answers, the tool runs.
 * 4. A ~16 KB reply renders to its last line; scrolling up loads older pages.
 *
 * The Host-restart path lives in `session-restart.smoke.test.tsx`, which needs
 * an outside watcher and is started on its own.
 *
 * Opt in with MYAID_SMOKE_HOST on a scratch home; the app starts the Host itself
 * (see screens/README.md). Keep the scratch root **outside `/tmp`**:
 * `workspace-write` grants `/tmp` and the platform temp dir outright, so the
 * approval step's marker would never ask. Everything this run creates stays
 * under that scratch root, and the approved command removes the marker itself:
 *
 *   SC=$PWD/.myaid-smoke                        # gitignored, outside /tmp
 *   mkdir -p "$SC/home"
 *   HOME="$SC/home" MYAID_SMOKE_HOST=1 MYAID_HOST_PORT=4879 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/session-model.smoke.test.tsx --target macos
 *
 * A headless run stops at the picture probe.
 */
import { homedir } from "os";
import { dirname, join } from "path";

import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_SESSION } from "./shots";

const WORKSPACE = "/tmp";

/**
 * The second Dialogue's directory. Two Sessions run at once only across
 * Workspaces, and `workspace.create` needs an existing directory: the scratch
 * home already is one.
 */
const OTHER = homedir();

// A prompt's first sentence becomes the Session's title (`titleFromPrompt`), so
// each one opens with a short, selector-safe tag.
const SLOW = (tag: string) =>
  `${tag} answer slowly. Write 18 numbered lines, one short sentence each, and nothing else.`;
/** Long enough that two of them certainly overlap on the wire. */
const STREAMING = (tag: string) =>
  `${tag} stream it. Write 60 numbered lines, one short sentence each, and nothing else.`;
/** Long enough that a prompt queued behind it is still waiting to be withdrawn. */
const ENDLESS = (tag: string) =>
  `${tag} keep going. Write 150 numbered lines, one short sentence each, and nothing else.`;
const title = (tag: string) => `${tag} answer slowly`;
const LONG = (tag: string, words = 2400) =>
  `${tag} write long. Write a technical document of at least ${words} words about release ` +
  "engineering, with a markdown heading every few paragraphs. Begin the reply with " +
  `${tag}-START and end it with ${tag}-END, on their own lines.`;
/** A fresh tag per run, so the model cannot answer from this machine's caches. */

/**
 * Where the approval step writes: the scratch root itself, one level above the
 * app's home. It must be outside the Session's sandbox workspace (that
 * escalation is what asks), and it must stay inside this run's scratch — never
 * a real home. It must also be outside `/tmp` and the platform temp dir:
 * `workspace-write` grants those outright (dsh-sandbox `writableRoots`), so a
 * marker there never asks. The command removes the file again.
 */
const APPROVAL_MARKER = join(dirname(homedir()), "d2-approval-marker");
const APPROVAL =
  "APPROVAL-D2 run it. Use the Bash tool to run exactly " +
  `\`sh -c "echo D2-APPROVAL-OK > ${APPROVAL_MARKER} && cat ${APPROVAL_MARKER} && ` +
  `rm -f ${APPROVAL_MARKER}"\` ` +
  "and then report its output in one short line.";

type App = Awaited<ReturnType<typeof open>>;

/** One palette command (⌘K), by its label. */
async function runPalette(app: App, label: string) {
  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", label);
  await app.keyboard.press("enter");
  await app.waitUntil(() => !app.shows("id:command-palette"), { timeout: 30000 });
}

/** Create a Bot on the scratch Host and open its first Session. */
async function botToChat(app: App, name: string, path = WORKSPACE) {
  await app.keyboard.press("mod+shift+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", name);
  await app.type("id:new-bot-workspace", path);
  // Create stays disabled until the sheet has read dsh's agent presets.
  await app.waitFor("text:Reading dsh presets…", { state: "gone", timeout: 120000 });
  await app.press("label:Create Bot");
  await app.waitFor("id:chat", { timeout: 180000 });
  await app.waitFor("id:composer", { timeout: 60000 });
}

/** Type a prompt into one Panel's composer and send it. */
async function send(app: App, prompt: string, nth = 0) {
  await app.type(`id:composer >> nth=${nth}`, prompt);
  await app.keyboard.press("enter");
}

/** Wait until no Session runs: the working row and the Stop button are gone. */
async function settled(app: App, timeout = 180000) {
  await app.waitFor("text:Working…", { state: "gone", timeout });
  await app.waitFor("label:Stop generating", { state: "gone", timeout: 60000 });
}

test("two Panels stream at once, a queued prompt is withdrawn, an approval round-trips", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;
  await app.waitFor("text:Host connected", { timeout: 60000 });

  // Two Dialogues over two directories, so both Sessions may run at once.
  await botToChat(app, "D2 Alpha");
  await send(app, SLOW("PANEL-A"));
  await settled(app);
  await botToChat(app, "D2 Beta", OTHER);
  await send(app, SLOW("PANEL-B"));
  await settled(app);

  // A second Panel shows Alpha's Session, so both transcripts are on screen.
  await runPalette(app, "Split Right");
  // The Dialogue lists its Sessions only while it is open in the tree.
  const row = `role:treeitem[${title("PANEL-A")}]`;
  if (!app.shows(row)) await app.press("role:treeitem[D2 Alpha · tmp]");
  await app.waitFor(row, { timeout: 60000 });
  await app.press(row);
  await app.waitFor("id:chat >> nth=1", { timeout: 60000 });
  await shoot(app, "01-two-panels.png", SHOTS_SESSION);

  // Both stream at the same time: the second send starts while the first runs.
  // The first turn is long enough that the second certainly starts while it
  // runs; the read below is the claim itself, taken the instant it is sent.
  await send(app, ENDLESS("PANEL-C"), 0);
  await app.waitFor("label:Stop generating >> nth=0", { timeout: 240000 });
  await send(app, STREAMING("PANEL-D"), 1);
  // Proof of overlap: the second Panel is running (its Stop button is up) and
  // the first Panel is still streaming at the same instant.
  await app.waitFor("label:Stop generating >> nth=1", { timeout: 60000 });
  expect(app.count("text:Working…")).toBe(2);
  expect(app.count("label:Stop generating")).toBe(2);
  await shoot(app, "02-two-working.png", SHOTS_SESSION);
  await settled(app, 600000);
  await app.waitUntil(
    () =>
      app.texts().some((text) => text.includes("PANEL-C")) &&
      app.texts().some((text) => text.includes("PANEL-D")),
    { timeout: 120000 },
  );
  await shoot(app, "03-both-settled.png", SHOTS_SESSION);

  // A prompt sent while a turn still runs is queued in dsh, and withdrawn by
  // its request id. A model that finishes the turn first admits the prompt as
  // its own turn instead: both are correct, and the transcript must never show
  // it twice.
  await send(app, "QUEUE-DROP say one word.", 0);
  const queued = await app
    .waitFor("text:QUEUED", { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  if (queued) {
    await shoot(app, "04-queued.png", SHOTS_SESSION);
    await app.press("label:Withdraw the queued message");
    await app.waitUntil(() => !app.shows("text:QUEUED"), { timeout: 60000 });
    expect(app.shows("text:QUEUE-DROP say one word.")).toBe(false);
    await settled(app, 420000);
    // Withdrawn means withdrawn: it never became a turn of its own.
    expect(app.texts().some((text) => text.trim().startsWith("QUEUE-DROP"))).toBe(false);
  } else {
    await settled(app, 420000);
    await app.waitUntil(
      () => app.texts().filter((text) => text.includes("QUEUE-DROP say one word")).length === 1,
      { timeout: 90000 },
    );
  }

  // The Beta Panel's workspace is the scratch home, so the marker above is
  // outside its sandbox: the Host asks, this Panel answers.
  await send(app, APPROVAL, 0);
  await app.waitFor("label:Allow once", { timeout: 300000 });
  await shoot(app, "05-approval.png", SHOTS_SESSION);
  await app.press("label:Allow once");
  await app.waitUntil(() => app.texts().some((text) => text.includes("D2-APPROVAL-OK")), {
    timeout: 300000,
  });
  await settled(app);
  await shoot(app, "06-approval-answered.png", SHOTS_SESSION);
}, 900_000);

test("a long reply renders to its last line, and older pages load above it", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;
  await app.waitFor("text:Host connected", { timeout: 60000 });

  await botToChat(app, "D2 Long");
  await send(app, LONG("LONG-D2"));
  await settled(app);
  // ~16 KB: the reply reaches its own closing marker at the end of the list.
  await app.waitUntil(() => app.texts().some((text) => text.includes("LONG-D2-END")), {
    timeout: 300000,
  });
  await shoot(app, "07-long-reply.png", SHOTS_SESSION);

  // Grow the log past one window (the opening page holds ≥50 messages or two
  // turns), then page backwards: the first prompt comes back into view.
  for (let index = 1; index <= 28; index++) {
    await send(app, `PAGE-${String(index).padStart(2, "0")} ok. Reply with the single word ok.`);
    await app.waitFor("label:Send", { timeout: 300000 });
  }
  for (let step = 0; step < 6; step++) {
    await app.scroll("id:transcript", -2000);
    await app.wait(400);
  }
  await app.waitUntil(() => app.texts().some((text) => text.includes("LONG-D2-START")), {
    timeout: 240000,
  });
  await shoot(app, "08-older-page.png", SHOTS_SESSION);
}, 1_800_000);
