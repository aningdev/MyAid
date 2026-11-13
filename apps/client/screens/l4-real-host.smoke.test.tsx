/**
 * Real-Host smoke for L4: in English, create a Bot on the Host the app starts,
 * take one turn, open Bot details, then switch the whole interface to
 * 简体中文 from Settings › General and back — no CJK in the English UI.
 *
 * Opt in on a scratch home; the app starts the Host itself:
 *
 *   HOME=<scratch>/home MYAID_SMOKE_HOST=1 MYAID_HOST_PORT=4883 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/l4-real-host.smoke.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { messages } from "../lib/i18n";
import { open } from "../test/open";
import { graphical, hostSmokeRequested } from "./shots";

const ECHO = "L4-4821";
const PROMPT = `${ECHO}: reply with the word ${ECHO} and nothing else.`;
// dsh records the Workspace in its own home (the scratch root); /tmp writes nothing.
const WORKSPACE = "/tmp";

const CJK = /[\u3400-\u9fff]/;
/** A language picker's endonyms are Chinese in every interface. */
const ENDONYMS = new Set(["简体中文"]);

test("English creates a Bot, takes a turn, opens details and switches language", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", {
    platform: "macos",
    width: 1440,
    height: 900,
    network: "live",
  });
  if (!(await graphical(app))) return;

  await app.waitFor(`label:${messages["nav.newBot"].en}`, { timeout: 30000 });
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Smoke Bot");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press(`label:${messages["newBot.create"].en}`);
  await app.waitFor("id:chat", { timeout: 120000 });
  await app.waitFor("id:composer", { timeout: 30000 });

  // One real turn through the Host and dsh; Send is the composer's button.
  await app.type("id:composer", PROMPT);
  await app.press(`label:${messages["chat.send"].en}`);
  await app.waitFor(`text:${PROMPT}`, { timeout: 10000 });
  await app.waitUntil(() => app.texts().some((text) => text.includes(ECHO)), {
    timeout: 180000,
  });

  // The English interface holds no Chinese but the language endonyms.
  for (const text of app.texts()) {
    if (ENDONYMS.has(text)) continue;
    expect({ text, cjk: CJK.test(text) }).toEqual({ text, cjk: false });
  }

  // Bot details, all four tabs, in English.
  const botDetails = messages["panel.botDetails"].en.replace("{name}", "Smoke Bot");
  await app.press(`label:${botDetails}`);
  await app.waitFor("id:bot-details");
  for (const tab of [
    "bot.tab.runs",
    "bot.tab.skills",
    "bot.tab.plugins",
    "bot.tab.profile",
  ] as const) {
    await app.press(`text:${messages[tab].en}`);
    await app.wait(120);
  }
  await app.press(`label:${messages["bot.closeDetails"].en}`);
  await app.waitUntil(() => !app.shows("id:bot-details"));

  // Settings › General switches the live interface, both ways, no relaunch.
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-overlay");
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  await app.press(`text:${messages["language.zh"].en}`);
  await app.waitUntil(() => app.shows(`label:${messages["nav.newBot"].zh}`));
  expect(app.texts()).toContain(messages["settings.title"].zh);
  await app.press(`text:${messages["language.en"].en}`);
  await app.waitUntil(() => app.shows(`label:${messages["nav.newBot"].en}`));
  expect(app.shows(`label:${messages["nav.newBot"].zh}`)).toBe(false);
}, 360000);
