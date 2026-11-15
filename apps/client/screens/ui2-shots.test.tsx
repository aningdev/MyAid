/**
 * The batch-2 controls of shadcn-nsh in both appearances: the ⌘K palette, Bot
 * details, the New Bot and rename dialogs, a row's context menu, three Panes,
 * the composer's menu and a Markdown reply. The registry and the client
 * prefs live in the app's isolated test storage, never the real `~/.myaid`:
 *
 *   nsh test screens/ui2-shots.test.tsx --target macos
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
import { open } from "../test/open";
import { workspaceRow, workspaceStorage } from "../test/workspaces";
import { graphical, shoot, SHOTS_UI2 } from "./shots";

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

/** The picture in both appearances. */
async function both(app: App, name: string): Promise<void> {
  await app.setColorScheme("light");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-light.png`, SHOTS_UI2);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-dark.png`, SHOTS_UI2);
  await app.setColorScheme("light");
}

test("palette, Bot details, dialogs, context menu and three Panes", async () => {
  const prefs = emptyShellPrefs();
  prefs.pins = ["ada"];
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
    storage: {
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
    },
  });
  if (!(await graphical(app))) return;

  await app.waitFor("label:Cleo");
  await app.waitFor("text:Pin");

  // Three Panes: Ada in the first, Bob and Cleo dragged in beside each other.
  await app.press("label:Ada");
  await app.waitFor("id:chat", { timeout: 30000 });
  await app.drag("label:Bob", { x: 220 });
  await app.waitFor("id:tab-panel-2", { timeout: 30000 });
  await app.drag("label:Cleo", { x: 220 });
  await app.waitFor("id:tab-panel-3", { timeout: 30000 });
  await both(app, "01-three-panes.png");
  expect(app.count("id:chat")).toBe(3);

  // Bot details, opened from the last Pane's header.
  await app.press("label:Bot details: Cleo");
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await both(app, "02-bot-details.png");
  await app.press("label:Cancel");
  await app.waitUntil(() => !app.shows("id:bot-details"));

  // The New Bot dialog.
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-dialog");
  await both(app, "03-new-bot.png");
  await app.press("label:Cancel");
  await app.waitUntil(() => !app.shows("id:new-bot-dialog"));

  // ⌘K filters as it opens.
  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", "Ada");
  await both(app, "04-command-palette.png");

  // Escape clears the query first, then closes the palette.
  await app.keyboard.press("Escape");
  expect(app.shows("id:command-palette")).toBe(true);
  await app.keyboard.press("Escape");
  await app.waitUntil(() => !app.shows("id:command-palette"));

  // A row of the palette runs its command: Settings opens, Escape leaves it.
  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", "Settings");
  await app.keyboard.press("Return");
  await app.waitFor("id:settings-overlay", { timeout: 30000 });
  await app.keyboard.press("Escape");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));

  // A row's context menu, then its Rename dialog.
  await app.rightClick("label:Bob");
  await app.waitFor("text:Bot details…");
  await both(app, "05-context-menu.png");
  await app.press("text:Rename…");
  await app.waitFor("id:rename-dialog", { timeout: 30000 });
  await both(app, "06-rename.png");
  await app.press("label:Cancel");
  await app.waitUntil(() => !app.shows("id:rename-dialog"));

  // Bot details from the same menu, then the rail's hover card.
  await app.rightClick("label:Bob");
  await app.waitFor("text:Bot details…");
  await app.press("text:Bot details…");
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await app.press("label:Cancel");
  await app.waitUntil(() => !app.shows("id:bot-details"));

  await app.hover("id:history-mark-0 >> nth=0");
  await app.waitFor("id:rail-card", { timeout: 30000 });
  await both(app, "07-hover-card.png");

  // Dragging a splitter writes the new widths to the client prefs.
  const before = app.storage()[SHELL_PREFS_STORAGE] ?? "";
  await app.drag("label:Resize navigator", { x: 36 });
  await app.drag("label:Resize panels >> nth=0", { x: -60 });
  await app.waitUntil(() => (app.storage()[SHELL_PREFS_STORAGE] ?? "") !== before, {
    timeout: 10000,
  });
  expect(app.storage()[SHELL_PREFS_STORAGE] ?? "").not.toBe(before);
}, 180000);

test("the composer's menu and a Markdown reply", async () => {
  const app = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:composer", { timeout: 30000 });

  // The composer's menu: the send key, open, then closed again.
  await app.press("text:Return to send");
  await app.waitFor("text:Return sends", { timeout: 30000 });
  await both(app, "08-composer-menu.png");

  // Picking a row sets the send key, and the hint follows it; picking again
  // puts Return back, which the rest of this test types with.
  await app.press("text:⌘Return sends");
  await app.waitUntil(() => app.shows("text:⌘Return to send"), { timeout: 5000 });
  await app.press("text:⌘Return to send");
  await app.press("text:Return sends");
  await app.waitUntil(() => app.shows("text:Return to send"), { timeout: 5000 });

  // A reply with a heading, a link, a code block and a table.
  await app.type("id:composer", "rich");
  await app.keyboard.press("Return");
  await app.waitFor("text:A short answer", { timeout: 30000 });
  await app.waitFor("text:Write it back", { timeout: 30000 });
  await both(app, "09-markdown.png");
  expect(app.texts().some((text) => text.includes("const answer = 42;"))).toBe(true);

  // An image, and the viewer a press on it opens.
  await app.type("id:composer", "picture");
  await app.keyboard.press("Return");
  await app.press("label:MyAid");
  await app.waitFor("id:image-viewer", { timeout: 30000 });
  await both(app, "10-image-viewer.png");
  await app.press("label:Close the image");
  await app.waitUntil(() => !app.shows("id:image-viewer"));
}, 120000);
