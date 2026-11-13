/**
 * Real-Host smoke: a Bot created through the New Bot sheet on a running Host,
 * one prompt answered with a 22-item numbered list (markers past one digit),
 * and the turn settling — Send back, no working dot — when dsh is done.
 *
 * Opt in with MYAID_SMOKE_HOST on a scratch home; the app starts the Host itself
 * (see screens/README.md):
 *
 *   HOME=<scratch>/home MYAID_SMOKE_HOST=1 MYAID_HOST_PORT=4879 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/real-turn.smoke.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_CHAT } from "./shots";

const ECHO = "TURN-SMOKE-5219";
const PROMPT = `${ECHO}: answer with a numbered list of exactly 22 items, one short sentence each, plain Markdown. Begin the reply with ${ECHO}.`;
const WORKSPACE = "/tmp";
const COUNT = 22;

test("a real turn ends with Send back and the working dot gone", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;

  await app.waitFor("text:Host connected", { timeout: 30000 });
  await app.keyboard.press("mod+shift+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Smoke Bot");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press("label:Create Bot");
  await app.waitFor("id:chat", { timeout: 120000 });
  await app.waitFor("id:composer", { timeout: 30000 });

  await app.type("id:composer", PROMPT);
  await app.keyboard.press("enter");
  // The turn runs: the working row, the Bot's mark, the Navigator dot.
  await app.waitFor("text:Working…", { timeout: 60000 });
  await app.waitFor("id:nav-status-working", { timeout: 30000 });
  expect(app.shows("label:Stop generating")).toBe(true);
  await shoot(app, "01-working.png", SHOTS_CHAT);

  // The turn ends: the reply holds 22 numbered items, and every running
  // state is gone — the composer offers Send and the Navigator dot with it.
  await app.waitFor("text:Working…", { state: "gone", timeout: 300000 });
  await app.waitUntil(() => app.texts().includes(`${COUNT}.`), { timeout: 60000 });
  await app.waitFor("label:Send", { timeout: 30000 });
  expect(app.shows("label:Stop generating")).toBe(false);
  // No row of the Navigator carries a status dot: the Session is idle, the
  // Panel shows it, nothing waits on approval.
  expect(app.count("id:nav-status-working")).toBe(0);
  expect(app.count("id:nav-status-unread")).toBe(0);
  expect(app.count("id:nav-status-attention")).toBe(0);
  // The reply is the Bot's, not the prompt echoed back.
  expect(app.texts().filter((text) => text.includes(ECHO)).length).toBeGreaterThanOrEqual(2);
  await shoot(app, "02-reply-settled.png", SHOTS_CHAT);
  // Frames for the dot's and the button's fades: at the instant the turn
  // ends they are mid-fade, and only a redraw makes them look stuck.
  await app.wait(1500);
  await shoot(app, "03-settled.png", SHOTS_CHAT);
}, 420000);
