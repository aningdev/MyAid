/**
 * The two languages side by side: the list with two Panes, Bot details,
 * Settings › General and the Host-offline footer, in English and 简体中文.
 *
 *   nsh test screens/l4-shots.test.tsx --target macos
 *
 * The apps are opened in the app's isolated storage, never the real
 * `~/.dsh-bot`; a headless run stops at the picture probe.
 */
import { test } from "nsh/test";

import {
  emptyShellPrefs,
  serializeShellPrefs,
  SHELL_PREFS_STORAGE,
} from "../components/shell/prefs";
import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  serializeRegistry,
  type BotRegistry,
} from "../features/bots/model";
import { REGISTRY_STORAGE_KEY } from "../features/bots/store";
import { messages, type MessageKey, type MessageValues } from "../lib/i18n";
import { open } from "../test/open";
import { workspaceRow, workspaceStorage } from "../test/workspaces";
import { graphical, shoot, SHOTS_L4 } from "./shots";

type Lang = "en" | "zh";

function say(lang: Lang, key: MessageKey, values: MessageValues = {}): string {
  return messages[key][lang].replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** Ada and Bob, each with a segment; Ada at /work/ada, Bob at /work/bob. */
function fixture(): BotRegistry {
  let registry = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  for (const [id, name] of [
    ["ada", "Ada"],
    ["bob", "Bob"],
  ] as const) {
    registry = initializeBot(createBot(registry, { name, templateId: "tmpl" }, id), id);
    registry = claimSegment(registry, id, `s-${id}`, `ws-${id}`);
  }
  return registry;
}

function storage(): Record<string, string> {
  const prefs = emptyShellPrefs();
  prefs.workbench = {
    layout: {
      center: {
        type: "split",
        axis: "horizontal",
        children: [
          { type: "tabs", panels: ["panel-1"], activeIndex: 0 },
          { type: "tabs", panels: ["panel-2"], activeIndex: 0 },
        ],
        sizes: [null, null],
      },
    },
    contents: { "panel-1": { botId: "ada" }, "panel-2": { botId: "bob" } },
    activePanelId: "panel-1",
  };
  return {
    [REGISTRY_STORAGE_KEY]: serializeRegistry(fixture()),
    [SHELL_PREFS_STORAGE]: serializeShellPrefs(prefs),
    ...workspaceStorage({
      rows: [
        workspaceRow({
          id: "ws-ada",
          path: "/work/ada",
          title: "ada",
          sessionIds: ["s-ada"],
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        workspaceRow({
          id: "ws-bob",
          path: "/work/bob",
          title: "bob",
          sessionIds: ["s-bob"],
          updatedAt: "2026-02-01T00:00:00.000Z",
        }),
      ],
    }),
  };
}

async function shotsFor(lang: Lang): Promise<void> {
  const app = await open("../App.tsx", {
    width: 1200,
    height: 820,
    locale: lang === "zh" ? "zh-CN" : "en-US",
    storage: storage(),
  });
  const probe = await graphical(app);
  if (!probe) return;
  await app.waitFor(`label:${say(lang, "panel.botDetails", { name: "Ada" })}`);
  await app.wait(250);
  await shoot(app, `${lang}-01-list-two-panes.png`, SHOTS_L4);

  // The Host footer is the launcher's empty state: a smaller window makes it legible.
  await app.setViewport(900, 620);
  await app.wait(200);
  await shoot(app, `${lang}-02-host-offline-footer.png`, SHOTS_L4);
  await app.setViewport(1200, 820);
  await app.wait(200);

  await app.press(`label:${say(lang, "panel.botDetails", { name: "Ada" })}`);
  await app.waitFor("id:bot-details");
  await app.wait(200);
  await shoot(app, `${lang}-03-bot-details.png`, SHOTS_L4);
  await app.press(`label:${say(lang, "bot.closeDetails")}`);
  await app.waitUntil(() => !app.shows("id:bot-details"));

  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-overlay");
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  await app.wait(200);
  await shoot(app, `${lang}-04-settings-general.png`, SHOTS_L4);
}

test("the list, two Panes, Bot details, Settings › General and the footer in English", async () => {
  await shotsFor("en");
}, 120_000);

test("the same surfaces in 简体中文", async () => {
  await shotsFor("zh");
}, 120_000);
