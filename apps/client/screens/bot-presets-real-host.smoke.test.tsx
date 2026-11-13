/**
 * Real-Host smoke for `myaid-plugin-bot-presets`: a template-bound Bot saves a
 * plugin switch in Bot Settings, reads its derived preset through the official
 * `agentPresets.read`, and starts a new Session under it.
 *
 * Opt in with MYAID_SMOKE_HOST_SOCKET; a headless run stops at the picture
 * probe. Run on macOS with the development Host up:
 *
 *   bun scripts/dev.mjs
 *   MYAID_SMOKE_HOST_SOCKET=$MYAID_HOST_SOCKET \
 *     nsh test screens/bot-presets-real-host.smoke.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_P1 } from "./shots";

const ECHO = "P1-PRESET-8173";
const PROMPT = `${ECHO}: write 5 numbered lines about release notes, one short sentence each. Begin your reply with ${ECHO}.`;
const WORKSPACE = "/tmp";

test("a Bot saves a derived preset and a new Session uses it", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;

  await app.waitFor("text:Host connected", { timeout: 30000 });
  await app.keyboard.press("mod+shift+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Preset Bot");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press("label:Create Bot");
  await app.waitFor("id:chat", { timeout: 120000 });

  // Open the Bot, then the sheet's editable Plugins tab.
  await app.press("role:treeitem[Preset Bot] >> nth=0");
  await app.waitFor("id:bot-name", { timeout: 30000 });
  await app.press("Bot Settings…");
  await app.waitFor("id:bot-settings");
  await app.press("Plugins");
  await app.waitFor("text:@deepseek-ai/dsh-tool-bash", { timeout: 30000 });
  await shoot(app, "01-plugins-editable.png", SHOTS_P1);

  await app.press("label:切换 @deepseek-ai/dsh-tool-bash");
  await app.press("id:bot-settings >> 保存");
  await app.waitUntil(() => !app.shows("id:bot-settings"), { timeout: 30000 });
  await app.waitFor("text:单独配置", { timeout: 30000 });
  await shoot(app, "02-binding.png", SHOTS_P1);

  // The Inspector names the derived preset the new Session runs.

  // New Session of the same Bot runs the derived preset.
  await app.press("label:/tmp");
  await app.waitFor("text:New Session", { timeout: 30000 });
  await app.press("label:New Session");
  await app.waitFor("id:chat", { timeout: 120000 });
  await app.keyboard.press("alt+mod+i");
  await app.waitFor("id:inspector-bot", { timeout: 30000 });
  await app.waitUntil(() => app.texts().some((text) => text.startsWith("myaid-bot-")), {
    timeout: 30000,
  });
  await shoot(app, "03-new-session-preset.png", SHOTS_P1);

  await app.type("id:composer", PROMPT);
  await app.keyboard.press("enter");
  await app.waitFor("text:Working…", { timeout: 60000 });
  await app.waitFor("text:Working…", { state: "gone", timeout: 180000 });
  await app.waitUntil(() => app.texts().filter((text) => text.includes(ECHO)).length >= 3, {
    timeout: 30000,
  });
  await shoot(app, "04-reply.png", SHOTS_P1);
}, 600000);
