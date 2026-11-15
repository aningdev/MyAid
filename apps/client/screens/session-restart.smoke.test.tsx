/**
 * Real-Host smoke for the reconnect path: the Host is killed mid-turn and
 * restarted, and the Client restores the Session window from the new Host
 * generation without duplicating anything.
 *
 * The app cannot signal a process, so the trigger is outside: start
 * `screens/host-restart-watch.mjs`, which reads the scratch Host's session log
 * and stops the Host as soon as a turn is live. The app's launcher starts it
 * again; the watcher only kills. Its own log is the record of the kill.
 *
 * Opt in with MYAID_SMOKE_HOST; run against a scratch home, never the user's
 * `~/.myaid` (see screens/README.md):
 *
 *   SC=$PWD/.myaid-smoke
 *   node apps/client/screens/host-restart-watch.mjs \
 *     --root "$SC/home/.myaid" --port 4879 --after-turns 1 &
 *   HOME="$SC/home" MYAID_SMOKE_HOST=1 MYAID_HOST_PORT=4879 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/session-restart.smoke.test.tsx --target macos
 *
 * A headless run stops at the picture probe.
 */
import { expect, test } from "nsh/test";

import { t } from "../lib/i18n";
import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_SESSION } from "./shots";

const WORKSPACE = "/tmp";

const LONG = (tag: string, words = 2400) =>
  `${tag} write long. Write a technical document of at least ${words} words about release ` +
  "engineering, with a markdown heading every few paragraphs. Begin the reply with " +
  `${tag}-START and end it with ${tag}-END, on their own lines.`;
/** A fresh tag per run, so the model cannot answer from this machine's caches. */
const NONCE = String(Date.now()).slice(-7);

type App = Awaited<ReturnType<typeof open>>;

/** Create a Bot on the scratch Host and open its first Session. */
async function botToChat(app: App, name: string) {
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-dialog");
  await app.type("id:new-bot-name", name);
  await app.type("id:new-bot-workspace", WORKSPACE);
  // Create stays disabled until the dialog has read dsh's agent presets.
  await app.waitFor(`text:${t("newBot.readingPresets")}`, { state: "gone", timeout: 120000 });
  await app.press(`label:${t("newBot.create")}`);
  await app.waitFor("id:chat", { timeout: 180000 });
  await app.waitFor("id:composer", { timeout: 60000 });
}

/** Type a prompt into the composer and send it. */
async function send(app: App, prompt: string) {
  await app.type("id:composer", prompt);
  await app.keyboard.press("enter");
}

test("the Host restarted mid-turn restores the window without duplicates", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;
  await app.waitFor(`text:${t("host.connected")}`, { timeout: 60000 });

  await botToChat(app, "D2 Restart");
  const tag = `RESTART-D2-${NONCE}`;
  await send(app, LONG(tag, 4000));
  await app.waitFor(`label:${t("chat.stopGenerating")}`, { timeout: 180000 });

  // The kill comes from the outside, as soon as this turn is on the wire:
  // `screens/host-restart-watch.mjs` (see this file's header). The turn can never
  // finish, so its closing marker must not appear, and the prompt must be in
  // the window exactly once when a new Host generation restores it.
  await app.waitFor(`text:${t("chat.working")}`, { state: "gone", timeout: 480000 });
  // The product reconnects by itself once the restarted Host answers; the loss
  // notice goes with the frame that proves it.
  await app.waitFor(`text:${t("session.connectionLost")}`, { state: "gone", timeout: 300000 });
  await app.waitFor(`text:${t("chat.sendKeyToSend", { label: "Return" })}`, { timeout: 120000 });
  await app.waitUntil(
    // The transcript message, not the Panel header's short Session title.
    () =>
      app.texts().filter((text) => text.includes("a technical document of at least")).length === 1,
    { timeout: 180000 },
  );
  // The reply was cut mid-flight: its closing marker never became a line of
  // its own (the prompt merely mentions it).
  expect(app.texts().some((text) => text.trim().startsWith(`${tag}-END`))).toBe(false);
  await shoot(app, "09-window-restored.png", SHOTS_SESSION);
}, 900_000);
