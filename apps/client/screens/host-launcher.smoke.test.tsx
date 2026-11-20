/**
 * Real-Host smoke for the native layer: the app starts the Host itself, one turn works, a Host
 * killed from outside is started again by the launcher, and the conversation is still there.
 *
 * Opt in with `DSH_BOT_SMOKE_HOST=1`, on a scratch home (the app's data root and the Host it
 * starts are both under it) and with `dsh-bot-host` on PATH:
 *
 *   SC=<scratch>/home
 *   HOME="$SC" DSH_BOT_SMOKE_HOST=1 DSH_BOT_HOST_PORT=4879 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/host-launcher.smoke.test.tsx --target macos
 *
 * `DSH_BOT_SMOKE_HOST=empty` takes the other picture: no Host answers and none can be started, so
 * the footer is the Host empty state with the manual command.
 *
 * The kill comes from outside: `screens/host-restart-watch.mjs --root <home>/.dsh-bot --port 4879`
 * stops the Host once its second turn is under way. The restarting is the launcher's.
 */
import { expect, test } from "nsh/test";

import { t } from "../lib/i18n";
import { open } from "../test/open";
import { graphical, hostSmokeMode, shoot, SHOTS_N1 } from "./shots";

const ECHO = "HOST-SMOKE-3391";
/** Each reply ends with its own marker, so a title or a prompt cannot pass for an answer. */
const REPLY_1 = `${ECHO}-BE1`;
const REPLY_2 = `${ECHO}-TURN2-DONE`;
const REPLY_3 = `${ECHO}-BE3`;
const WORKSPACE = "/tmp";

test("the app starts the Host, survives its restart, and keeps the conversation", async () => {
  const mode = hostSmokeMode();
  if (!mode) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;

  if (mode === "empty") {
    // Nothing answers on the port and the binary is not on PATH: the footer says how to start
    // one by hand instead of pretending a Host is there.
    await app.waitFor(`text:${t("host.manual", { command: "dsh-bot-host serve-app" })}`, {
      timeout: 60000,
    });
    await shoot(app, "03-host-empty-state.png", SHOTS_N1);
    return;
  }

  // Cold start: no Host is running, and the launcher starts one.
  await app.waitFor(`text:${t("host.connected")}`, { timeout: 120000 });
  await shoot(app, "01-host-running.png", SHOTS_N1);

  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-dialog");
  await app.type("id:new-bot-name", "Launcher Bot");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press(`label:${t("newBot.create")}`);
  await app.waitFor("id:chat", { timeout: 120000 });
  await app.waitFor("id:composer", { timeout: 30000 });

  // One turn on the Host the app started: the reply carries its marker.
  await app.type("id:composer", `${ECHO}: answer in one short sentence that ends with ${REPLY_1}.`);
  await app.keyboard.press("enter");
  // The prompt row and the reply row both carry the marker: two of them is an answer.
  await app.waitUntil(() => app.texts().filter((text) => text.includes(REPLY_1)).length >= 2, {
    timeout: 300000,
  });
  await app.waitFor(`label:${t("chat.send")}`, { timeout: 120000 });

  // A second turn is the one the watcher stops the Host in: the launcher starts it again, the
  // transcript is still here, and the Session the registry claims is the same one.
  await app.type(
    "id:composer",
    `${ECHO}-TURN2: answer with three short sentences, and end with ${REPLY_2}.`,
  );
  await app.keyboard.press("enter");
  await app.waitFor(`text:${t("host.disconnected")}`, { timeout: 180000 });
  await app.waitFor(`text:${t("host.connected")}`, { timeout: 240000 });
  // "Host connected" is the new generation's probe answering, not its Session window: the Pane
  // re-subscribes on that generation and reads the log back a moment later. Wait for the window
  // rather than the probe.
  await app.waitUntil(() => app.texts().filter((text) => text.includes(REPLY_1)).length >= 2, {
    timeout: 120000,
  });

  // A turn on the restarted Host: the conversation resumes, not just the transcript.
  await app.waitFor("id:composer", { timeout: 60000 });
  await app.type("id:composer", `${ECHO}-AGAIN: reply with one short sentence ending ${REPLY_3}.`);
  await app.keyboard.press("enter");
  await app.waitUntil(() => app.texts().filter((text) => text.includes(REPLY_3)).length >= 2, {
    timeout: 300000,
  });
  await app.waitFor(`label:${t("chat.send")}`, { timeout: 120000 });
  await shoot(app, "02-restarted-and-resumed.png", SHOTS_N1);
}, 900000);
