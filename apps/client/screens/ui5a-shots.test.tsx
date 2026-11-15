/**
 * Batch 5a of the shadcn-nsh copies: the `Separator` in the Navigator, in Bot
 * details and around the chat's dividers, `Kbd` on the New Bot row, in the
 * palette's hints and in the welcome's sentence, and the `Empty` block of an
 * empty Pane. Both appearances.
 *
 *   mkdir -p ~/.myaid-dev/shots/pi-shots-ui5a
 *   nsh test screens/ui5a-shots.test.tsx --target macos
 *
 * A headless run stops at the picture probe.
 */
import { expect, test } from "nsh/test";
import type { App } from "nsh/test";

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
import { t } from "../lib/i18n";
import { open } from "../test/open";
import { workspaceRow, workspaceStorage } from "../test/workspaces";
import { graphical, shoot, SHOTS_UI5A } from "./shots";

/** Ada, Bob and Cleo, each ready with one segment over one Workspace. */
function fixture(): BotRegistry {
  let registry = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  for (const [id, name] of [
    ["ada", "Ada"],
    ["bob", "Bob"],
    ["cleo", "Cleo"],
  ] as const) {
    registry = initializeBot(createBot(registry, { name, templateId: "tmpl" }, id), id);
    registry = claimSegment(registry, id, `s-${id}`, `ws-${id}`);
  }
  return registry;
}

/** Ada pinned, Bob and Cleo under the line, no Pane open: the empty Pane shows. */
function shellStorage(): Record<string, string> {
  const prefs = emptyShellPrefs();
  prefs.pins = ["ada"];
  return {
    [REGISTRY_STORAGE_KEY]: serializeRegistry(fixture()),
    [SHELL_PREFS_STORAGE]: serializeShellPrefs(prefs),
    ...workspaceStorage({
      rows: ["ada", "bob", "cleo"].map((id, index) =>
        workspaceRow({
          id: `ws-${id}`,
          path: `/work/${id}`,
          title: id,
          sessionIds: [`s-${id}`],
          updatedAt: `2026-02-0${3 - index}T00:00:00.000Z`,
        }),
      ),
    }),
  };
}

/** The picture in both appearances. */
async function both(app: App, name: string): Promise<void> {
  await app.setColorScheme("light");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-light.png`, SHOTS_UI5A);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-dark.png`, SHOTS_UI5A);
  await app.setColorScheme("light");
}

test("the Pin line and the New Bot row, the empty Pane, the palette's hints", async () => {
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
    storage: shellStorage(),
  });
  if (!(await graphical(app))) return;
  await app.waitFor("label:Cleo");

  // The line between the Pin group and the rest, the New Bot row's caps, and
  // the empty Pane beside them: no Bot is open.
  await app.waitFor("text:Pin");
  expect(app.texts()).toContain(t("nav.newBot"));
  // The caps are the keys, not one label: ⌘ and N.
  expect(app.texts()).toContain("⌘");
  expect(app.texts()).toContain("N");
  expect(app.texts()).toContain(t("empty.panelTitle"));
  expect(app.texts()).toContain(t("empty.panelNote"));
  await both(app, "11-navigator-pin-empty-pane.png");

  // ⌘K: each hint is its keys and its word.
  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.wait(200);
  await both(app, "13-palette-hints.png");
  expect(app.texts()).toContain(t("palette.move"));
  expect(app.texts()).toContain(t("palette.open"));
  expect(app.texts()).toContain(t("palette.close"));
  expect(app.texts()).toContain("Esc");
}, 180000);

test("the welcome's shortcut, in a sentence", async () => {
  // A first launch: no Bot at all, so the welcome takes the Pane.
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
  });
  if (!(await graphical(app))) return;
  await app.waitFor(`label:${t("welcome.create")}`);
  await both(app, "21-welcome.png");
  expect(app.texts()).toContain(t("welcome.shortcut"));
  expect(app.texts()).toContain("⌘");
}, 120000);

test("Bot details: the line over the current segment", async () => {
  const app = await open("../features/bots/bot-details-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 900,
    storage: {
      [REGISTRY_STORAGE_KEY]: serializeRegistry(fixture()),
      ...workspaceStorage({
        rows: [
          workspaceRow({ id: "ws-work", path: "/work/myaid", title: "myaid", sessionIds: ["s1"] }),
        ],
      }),
    },
  });
  if (!(await graphical(app))) return;
  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");
  await app.press("label:Bot details: Ada");
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await app.press("Runs with");
  await app.waitFor(`text:${t("bot.segment.current")}`, { timeout: 30000 });
  // The section sits at the foot of the modal's scroll: the line over it only
  // shows scrolled into view.
  await app.scroll("id:bot-details-segment", 900);
  await app.wait(300);
  await both(app, "31-bot-details-segment.png");
  expect(app.shows("id:bot-details-segment")).toBe(true);
}, 120000);

test("the chat's day divider, and a segment's date · directory", async () => {
  const app = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:composer", { timeout: 30000 });
  await app.type("id:composer", "hello there");
  await app.keyboard.press("Return");
  // The day's row sits over today's messages, which start the transcript.
  await app.waitFor(`text:${t("time.today")}`, { timeout: 30000 });
  await app.scroll("id:transcript", -3000);
  await app.wait(300);
  await both(app, "41-chat-today.png");
  expect(app.texts()).toContain(t("time.today"));

  // Two segments in two directories: the divider is a hairline either side of
  // the date and the path.
  const conversation = await open("../features/dialogue/long-conversation-harness.tsx", {
    platform: "macos" as const,
    width: 1200,
    height: 900,
  });
  if (!(await graphical(conversation))) return;
  await conversation.waitFor("text:follow-up answer 19");
  await conversation.press("id:history-mark-s1");
  await conversation.waitFor("text:the earlier answer");
  // Off the rail: its hover card would sit over the second divider.
  await conversation.hover("id:composer");
  await conversation.wait(300);
  await both(conversation, "42-segment-divider.png");
  expect(conversation.shows("id:segment-divider")).toBe(true);
}, 180000);
