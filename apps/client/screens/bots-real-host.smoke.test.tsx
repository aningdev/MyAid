/**
 * Real-Host smoke for `dsh-bots`: a template-bound Bot saves a
 * plugin switch in its Bot details modal and reads the derived preset back
 * (Profile shows the id and 单独配置). Starting a new segment under it lands
 * with the long conversation; this smoke answers one prompt on the Bot.
 *
 * Opt in with DSH_BOT_SMOKE_HOST on a scratch home; the app starts the Host itself
 * (see screens/README.md). The overlay must name the plugin built from this
 * checkout, so build it first:
 *
 *   vp run dsh-bots#build
 *   HOME=<scratch>/home DSH_BOT_HOME=<scratch> DSH_BOT_SMOKE_HOST=1 \
 *     DSH_BOT_HOST_PORT=4879 \
 *     DSH_BOT_PATCH="$PWD/.dev/bots.patch.yml" \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/bots-real-host.smoke.test.tsx --target macos
 *
 * `<scratch>` must sit under `~/.dsh-bot-dev`. The create-Bot test reads
 * `$DSH_BOT_HOME/bots/registry.json` and refuses any other root.
 */
import fs from "fs/promises";
import { homedir } from "os";
import { join } from "path";

import { expect, test } from "nsh/test";

import { t } from "../lib/i18n";
import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_P1 } from "./shots";

const ECHO = "P1-PRESET-8173";
const PROMPT = `${ECHO}: write 5 numbered lines about release notes, one short sentence each. Begin your reply with ${ECHO}.`;
const WORKSPACE = "/tmp";

test("a Bot saves a derived preset and reads it back", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;

  await app.waitFor(`text:${t("host.connected")}`, { timeout: 30000 });
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-dialog");
  await app.type("id:new-bot-name", "Preset Bot");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press(`label:${t("newBot.create")}`);
  await app.waitFor("id:chat", { timeout: 120000 });

  // Open the Bot's details from the Pane header, then its editable Plugins tab.
  await app.press(`label:${t("panel.botDetails", { name: "Preset Bot" })}`);
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await app.press(t("bot.tab.plugins"));
  await app.waitFor("text:@deepseek-ai/dsh-tool-bash", { timeout: 30000 });
  await shoot(app, "01-plugins-editable.png", SHOTS_P1);

  await app.press(`label:${t("bot.plugins.toggle", { name: "@deepseek-ai/dsh-tool-bash" })}`);
  await app.press(`id:bot-details >> ${t("common.save")}`);
  await app.waitUntil(() => !app.shows("id:bot-details"), { timeout: 30000 });
  // The saved derived preset is what the Bot's next segment will run.
  await app.press(`label:${t("panel.botDetails", { name: "Preset Bot" })}`);
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await app.waitFor(`text:${t("bot.binding.custom")}`, { timeout: 30000 });
  await app.waitUntil(() => app.texts().some((text) => text.startsWith("bots-")), {
    timeout: 30000,
  });
  await shoot(app, "02-binding.png", SHOTS_P1);
  await app.press(t("common.cancel"));

  await app.type("id:composer", PROMPT);
  await app.keyboard.press("enter");
  await app.waitFor(`text:${t("chat.working")}`, { timeout: 60000 });
  await app.waitFor(`text:${t("chat.working")}`, { state: "gone", timeout: 180000 });
  await app.waitUntil(() => app.texts().filter((text) => text.includes(ECHO)).length >= 3, {
    timeout: 30000,
  });
  await shoot(app, "04-reply.png", SHOTS_P1);
}, 600000);

/**
 * Creating a Bot through the New Bot dialog writes the plugin's Registry and
 * the Navigator shows the new row. Requires `DSH_BOT_HOME` under
 * `~/.dsh-bot-dev` so the assertion never opens the real `~/.dsh-bot`.
 */
test("creating a Bot writes the plugin registry and shows it in the Navigator", async () => {
  if (!hostSmokeRequested()) return;
  const root = process.env.DSH_BOT_HOME ?? "";
  const isolated = join(homedir(), ".dsh-bot-dev");
  if (root !== isolated && !root.startsWith(`${isolated}/`)) {
    throw new Error(
      "Set DSH_BOT_HOME to a directory under ~/.dsh-bot-dev. This smoke does not read ~/.dsh-bot.",
    );
  }
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;

  await app.waitFor(`text:${t("host.connected")}`, { timeout: 30000 });
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-dialog");
  await app.type("id:new-bot-name", "Smoke Bot");
  await app.type("id:new-bot-workspace", "/tmp");
  await app.press(`label:${t("newBot.create")}`);
  await app.waitFor("label:Smoke Bot", { timeout: 120000 });

  const text = await fs.readFile(join(root, "bots", "registry.json"), "utf8");
  expect(text).toContain("Smoke Bot");
  expect(text).toContain("bots-main");
}, 180000);
