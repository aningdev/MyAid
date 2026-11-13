/**
 * Real-Host smoke for `myaid-plugin-bot-presets`: a template-bound Bot saves a
 * plugin switch in its Bot details modal and reads the derived preset back
 * (Profile shows the id and 单独配置). Starting a new segment under it lands
 * with the long conversation; this smoke answers one prompt on the Bot.
 *
 * Opt in with MYAID_SMOKE_HOST on a scratch home; the app starts the Host itself
 * (see screens/README.md):
 *
 *   HOME=<scratch>/home MYAID_SMOKE_HOST=1 MYAID_HOST_PORT=4879 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/bot-presets-real-host.smoke.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_P1 } from "./shots";

const ECHO = "P1-PRESET-8173";
const PROMPT = `${ECHO}: write 5 numbered lines about release notes, one short sentence each. Begin your reply with ${ECHO}.`;
const WORKSPACE = "/tmp";

test("a Bot saves a derived preset and reads it back", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;

  await app.waitFor("text:Host connected", { timeout: 30000 });
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Preset Bot");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press("label:Create Bot");
  await app.waitFor("id:chat", { timeout: 120000 });

  // Open the Bot's details from the Pane header, then its editable Plugins tab.
  await app.press("label:Bot details: Preset Bot");
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await app.press("Plugins");
  await app.waitFor("text:@deepseek-ai/dsh-tool-bash", { timeout: 30000 });
  await shoot(app, "01-plugins-editable.png", SHOTS_P1);

  await app.press("label:切换 @deepseek-ai/dsh-tool-bash");
  await app.press("id:bot-details >> Save");
  await app.waitUntil(() => !app.shows("id:bot-details"), { timeout: 30000 });
  // The saved derived preset is what the Bot's next segment will run.
  await app.press("label:Bot details: Preset Bot");
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await app.waitFor("text:单独配置", { timeout: 30000 });
  await app.waitUntil(() => app.texts().some((text) => text.startsWith("myaid-bot-")), {
    timeout: 30000,
  });
  await shoot(app, "02-binding.png", SHOTS_P1);
  await app.press("Cancel");

  await app.type("id:composer", PROMPT);
  await app.keyboard.press("enter");
  await app.waitFor("text:Working…", { timeout: 60000 });
  await app.waitFor("text:Working…", { state: "gone", timeout: 180000 });
  await app.waitUntil(() => app.texts().filter((text) => text.includes(ECHO)).length >= 3, {
    timeout: 30000,
  });
  await shoot(app, "04-reply.png", SHOTS_P1);
}, 600000);
