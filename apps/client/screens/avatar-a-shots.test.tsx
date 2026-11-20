/**
 * Batch A of the Bot's identity mark: dsh-bot's own little character — a body in
 * the Bot's accent with two eyes cut out of it. The contact sheets prove every
 * body against every face, at the sizes the app draws and large enough to see
 * the holes; the rest walks the screens that carry the mark, the picker, and a
 * registry written by the version before this one.
 *
 *   mkdir -p ~/.dsh-bot-dev/shots/pi-shots-avatar-a
 *   nsh test screens/avatar-a-shots.test.tsx --target macos
 *
 * The apps are opened in the app's isolated storage, never the real `~/.dsh-bot`;
 * a headless run stops at the picture probe.
 */
import { expect, test } from "nsh/test";
import type { App } from "nsh/test";

import {
  emptyShellPrefs,
  serializeShellPrefs,
  SHELL_PREFS_STORAGE,
} from "../components/shell/prefs";
import { BOT_COLORS, BOT_FACES, BOT_SHAPES, defaultIdentity } from "../features/bots/identity";
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
import { graphical, shoot, SHOTS_AVATAR_A } from "./shots";

/** A mark in both appearances. */
async function both(app: App, name: string): Promise<void> {
  await app.setColorScheme("light");
  await app.wait(250);
  await shoot(app, `${name}-light.png`, SHOTS_AVATAR_A);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${name}-dark.png`, SHOTS_AVATAR_A);
  await app.setColorScheme("light");
}

/** One Bot, ready, with one segment over one Workspace; the one Pane opens it. */
function shellRegistry(botId = "ada", name = "Ada"): BotRegistry {
  let registry = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  registry = initializeBot(createBot(registry, { name, templateId: "tmpl" }, botId), botId);
  return claimSegment(registry, botId, `s-${botId}`, `ws-${botId}`);
}

function shellPrefs(botId = "ada") {
  const prefs = emptyShellPrefs();
  prefs.workbench = {
    layout: { center: { type: "tabs", panels: ["panel-1"], activeIndex: 0 } },
    contents: { "panel-1": { botId } },
    activePanelId: "panel-1",
  };
  return serializeShellPrefs(prefs);
}

function storageOf(registry: BotRegistry, botId = "ada"): Record<string, string> {
  return {
    [REGISTRY_STORAGE_KEY]: serializeRegistry(registry),
    [SHELL_PREFS_STORAGE]: shellPrefs(botId),
    ...workspaceStorage({
      rows: [
        workspaceRow({
          id: `ws-${botId}`,
          path: "/work/ada",
          title: "ada",
          sessionIds: [`s-${botId}`],
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    }),
  };
}

test("the contact sheets: every body, every face, three sizes and the close-ups", async () => {
  const app = await open("./avatar-a-harness.tsx", {
    platform: "macos" as const,
    width: 980,
    height: 780,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:avatar-a-harness");
  await app.wait(250);

  // 48px: the size Bot details and the empty Pane draw, in both appearances.
  await both(app, "11-sheet-48");
  expect(app.count("id:cell-round-calm")).toBe(1);
  expect(app.count("id:cell-star-curious")).toBe(1);

  // 22px: the Navigator, the chat's rows and the New Bot dialog.
  await app.press("id:sheet-22");
  await app.wait(250);
  await shoot(app, "21-sheet-22.png", SHOTS_AVATAR_A);

  // 16px: the Pane's title mark, the smallest the app draws.
  await app.press("id:sheet-16");
  await app.wait(250);
  await shoot(app, "22-sheet-16.png", SHOTS_AVATAR_A);

  // 96px: the four narrow bodies, calm and curious, large enough to see the holes.
  await app.press("id:sheet-96");
  await app.wait(250);
  await shoot(app, "31-close-ups-96.png", SHOTS_AVATAR_A);
  expect(app.count("id:close-triangle-calm")).toBe(1);
  expect(app.count("id:close-drop-curious")).toBe(1);
}, 180000);

test("the screens that carry the mark: Navigator, Pane title, New Bot, Bot details", async () => {
  // Eight Bots, one body each, so the Navigator shows the whole family.
  let registry = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  BOT_SHAPES.forEach((shape, index) => {
    const id = `bot-${shape}`;
    registry = initializeBot(
      createBot(
        registry,
        {
          name: shape.charAt(0).toUpperCase() + shape.slice(1),
          templateId: "tmpl",
          identity: {
            color: BOT_COLORS[index % BOT_COLORS.length] ?? "indigo",
            shape,
            face: BOT_FACES[index % BOT_FACES.length] ?? "calm",
          },
        },
        id,
      ),
      id,
    );
  });
  registry = claimSegment(registry, "bot-round", "s-round", "ws-round");

  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1280,
    height: 860,
    storage: {
      [REGISTRY_STORAGE_KEY]: serializeRegistry(registry),
      [SHELL_PREFS_STORAGE]: shellPrefs("bot-round"),
      ...workspaceStorage({
        rows: [
          workspaceRow({
            id: "ws-round",
            path: "/work/ada",
            title: "ada",
            sessionIds: ["s-round"],
            updatedAt: "2026-01-01T00:00:00.000Z",
          }),
        ],
      }),
    },
  });
  if (!(await graphical(app))) return;
  await app.waitFor("label:Round");
  await app.wait(250);
  // The Navigator's 18px marks, and the Pane title's 16px one.
  await both(app, "41-navigator-and-title");

  // New Bot: the 38px mark over the three rows of choices.
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-dialog");
  await app.wait(250);
  await both(app, "42-new-bot");
  expect(app.count("id:bot-shape-star")).toBe(1);
  await app.press("label:Cancel");

  // Bot details: the 28px mark and the picker inside the Bot's own screen.
  await app.press(`label:${t("panel.botDetails", { name: "Round" })}`);
  await app.waitFor("id:bot-details");
  await app.wait(250);
  await both(app, "43-bot-details");
}, 180000);

test("a message row's 22px mark", async () => {
  const app = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:composer", { timeout: 30000 });
  // A script that finishes at once: the row is the picture, not the streaming.
  await app.type("id:composer", "rich");
  await app.keyboard.press("Return");
  await app.waitFor("text:A short answer", { timeout: 30000 });
  await app.wait(250);
  await both(app, "51-message-row");
}, 180000);

test("the picker: a press on a shape and on a face shows at once", async () => {
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1280,
    height: 860,
    storage: storageOf(shellRegistry()),
  });
  if (!(await graphical(app))) return;
  await app.waitFor(`label:${t("panel.botDetails", { name: "Ada" })}`);
  await app.press(`label:${t("panel.botDetails", { name: "Ada" })}`);
  await app.waitFor("id:bot-details");
  await app.wait(250);
  await app.setColorScheme("light");
  await shoot(app, "61-picker-before.png", SHOTS_AVATAR_A);

  await app.press("id:bot-shape-triangle");
  await app.wait(250);
  await shoot(app, "62-picker-shape-after.png", SHOTS_AVATAR_A);
  // The seed's face is wink: press one this Bot is not wearing yet.
  await app.press("id:bot-face-sleepy");
  await app.wait(250);
  await shoot(app, "63-picker-face-after.png", SHOTS_AVATAR_A);

  // The presses reached the registry: the shape and the face are stored, and
  // the v4 glyph goes beside them.
  await app.press(`label:${t("common.save")}`);
  await app.wait(400);
  const stored = app.storage()[REGISTRY_STORAGE_KEY] ?? "";
  expect(stored).toContain('"shape": "triangle"');
  expect(stored).toContain('"face": "sleepy"');
  expect(stored).toContain('"glyph": "prism"');
}, 180000);

test("a registry from before this batch: the color stays, the shape is the glyph's", async () => {
  // The file the version before this one wrote: `{color, glyph}`, and nothing else.
  const file = JSON.parse(serializeRegistry(shellRegistry())) as {
    bots: { identity: unknown }[];
  };
  file.bots[0]!.identity = { color: "teal", glyph: "bolt" };
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1280,
    height: 860,
    storage: {
      ...storageOf(shellRegistry()),
      [REGISTRY_STORAGE_KEY]: `${JSON.stringify(file, null, 2)}\n`,
    },
  });
  if (!(await graphical(app))) return;
  await app.waitFor("label:Ada");
  await app.setColorScheme("light");
  await app.wait(250);
  // Teal as stored, and the body the bolt became.
  await both(app, "71-migrated-shell");

  // The picker agrees: the drop is the shape in effect, and saving stores it.
  await app.press(`label:${t("panel.botDetails", { name: "Ada" })}`);
  await app.waitFor("id:bot-details");
  await app.wait(250);
  await shoot(app, "72-migrated-shape.png", SHOTS_AVATAR_A);
  await app.press(`label:${t("common.save")}`);
  await app.wait(400);
  const stored = JSON.parse(app.storage()[REGISTRY_STORAGE_KEY] ?? "{}") as {
    bots: { identity: Record<string, string> }[];
  };
  expect(stored.bots[0]?.identity).toEqual({
    color: "teal",
    shape: "drop",
    face: defaultIdentity("ada").face,
    glyph: "bolt",
  });
}, 180000);
