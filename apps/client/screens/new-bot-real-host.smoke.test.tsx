/**
 * Real-Host smoke: create a Bot through the New Bot sheet on the Host the app
 * starts, send a prompt, and get the reply back. Screenshots the working mark
 * and the reply. A headless run stops at the picture probe.
 *
 * Opt in with MYAID_SMOKE_HOST on a scratch home; the app starts the Host
 * itself (see screens/README.md):
 *
 *   HOME=<scratch>/home MYAID_SMOKE_HOST=1 MYAID_HOST_PORT=4879 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/new-bot-real-host.smoke.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { t } from "../lib/i18n";
import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot } from "./shots";

const ECHO = "SMOKE-8173";
// The marker opens the prompt, so the Session's title carries it too, and a
// reply long enough to catch the working state ends with it as well.
const PROMPT = `${ECHO}: write 20 numbered lines about release notes, one short sentence each. Begin your reply with ${ECHO}.`;
const WORKSPACE = "/tmp";

test("a new Bot created through the sheet replies", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;

  await app.waitFor(`text:${t("host.connected")}`, { timeout: 30000 });
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Smoke Bot");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press(`label:${t("newBot.create")}`);

  // The sheet closes, the first Session is created and its chat opens.
  await app.waitFor("id:chat", { timeout: 120000 });
  await app.waitFor("id:composer", { timeout: 30000 });
  expect(app.shows("id:new-bot-sheet")).toBe(false);

  await app.type("id:composer", PROMPT);
  await app.keyboard.press("enter");
  // The Bot's mark breathes while the turn runs, and the transcript says
  // who is working.
  await app.waitFor("id:bot-mark-working", { timeout: 60000 });
  await app.waitFor(`text:${t("chat.working")}`, { timeout: 60000 });
  await shoot(app, "06-working.png");

  // The turn ends (the working row goes), then the reply arrives: the
  // header's Session title, the prompt bubble and the reply all carry it.
  await app.waitFor(`text:${t("chat.working")}`, { state: "gone", timeout: 180000 });
  await app.waitFor("id:nav-status-working", { state: "gone", timeout: 30000 });
  await app.waitUntil(() => app.texts().filter((text) => text.includes(ECHO)).length >= 3, {
    timeout: 30000,
  });
  await shoot(app, "07-reply.png");
  expect(app.count("id:chat")).toBe(1);
}, 240000);
