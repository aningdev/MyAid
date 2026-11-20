/**
 * Batch B of the Bot's identity mark: the character moves. What it does at
 * rest (a blink, a drifting gaze), while a turn of its Bot runs (a breath, a
 * scan, quicker blinks) and while it changes form, drawn at the moments the
 * batch agreed and frozen there — plus the screens where the motion is seen,
 * a turn under way in the list, the Pane's title and a message row, in both
 * appearances and with reduced motion.
 *
 *   mkdir -p ~/.dsh-bot-dev/shots/avatar-b
 *   nsh test screens/avatar-b-shots.test.tsx --target macos
 *
 * The moment is a mark's own `time` where a sheet needs several at once, or the
 * clock's hold, which freezes every mark at one moment (`holdAvatarClock`, driven
 * from the harness screens). The sheets and the picker's three frames are the
 * same bytes however often the test runs; a whole-screen picture of a running
 * turn also carries the app's own live caret and spinner, whose phases follow
 * the wall clock, and those two may shift by a pixel between runs. The wall
 * clock itself is fixed (`FIXED_TIME`), so the timestamps in a picture do not
 * move. The apps are opened in the app's isolated storage, never the real
 * `~/.dsh-bot`; a headless run stops at the picture probe.
 */
import { expect, test } from "nsh/test";
import type { App } from "nsh/test";

import {
  emptyShellPrefs,
  serializeShellPrefs,
  SHELL_PREFS_STORAGE,
} from "../components/shell/prefs";
import { emptyRegistry, type BotRegistry } from "../features/bots/model";
import { t } from "../lib/i18n";
import {
  botsStorage,
  claimSegment,
  createBot,
  createTemplate,
  initializeBot,
} from "../test/bots-fixture";
import { open } from "../test/open";
import { workspaceRow, workspaceStorage } from "../test/workspaces";
import { graphical, shoot, SHOTS_AVATAR_B } from "./shots";

/** The wall clock every picture of a turn is taken on: a fixed Wednesday morning. */
const FIXED_TIME = new Date("2026-03-04T09:30:00.000Z");

/**
 * A picture in both appearances, back to light afterwards. One frame waits out
 * the theme: nothing else moves the clock, so a screen that carries a turn's
 * own clock (its elapsed label) shows the same moment twice.
 */
async function both(app: App, name: string): Promise<void> {
  await app.setColorScheme("light");
  await app.wait(16);
  await shoot(app, `${name}-light.png`, SHOTS_AVATAR_B);
  await app.setColorScheme("dark");
  await app.wait(16);
  await shoot(app, `${name}-dark.png`, SHOTS_AVATAR_B);
  await app.setColorScheme("light");
}

/** One Bot, ready, with one segment over one Workspace; the one Pane opens it. */
function shellRegistry(botId = "ada", name = "Ada", shape = "round"): BotRegistry {
  let registry = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  registry = initializeBot(
    createBot(
      registry,
      {
        name,
        templateId: "tmpl",
        identity: { color: "teal", shape: shape as "round", face: "calm" },
      },
      botId,
    ),
    botId,
  );
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
    ...botsStorage(registry),
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

test("the puzzle: a breath, a blink and a change of form, at the moments agreed", async () => {
  const app = await open("./avatar-b-harness.tsx", {
    platform: "macos" as const,
    width: 980,
    height: 820,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:avatar-b-harness");
  await app.wait(250);

  // Four bodies at the eight moments of one breath, then in the dark.
  expect(app.count("id:work-star-1400")).toBe(1);
  await both(app, "11-working-breath");

  // A blink, beginning, middle and end, on a dot, an arch and a line.
  await app.press("id:sheet-idle");
  await app.wait(250);
  await both(app, "12-idle-blink");
  expect(app.count("id:blink-happy-1")).toBe(1);

  // A body becoming another, and a dot face becoming an arch one.
  await app.press("id:sheet-morph");
  await app.wait(250);
  await both(app, "13-morph");
  expect(app.count("id:morph-shape-0")).toBe(1);

  // Every body with every face at 16 px: the smallest the mark is drawn, and
  // the size where a rim of a tenth of a body is a single point.
  await app.press("id:sheet-tiny");
  await app.wait(250);
  expect(app.count("id:tiny-star-focus")).toBe(1);
  await both(app, "14-tiny-16px");
}, 180000);

test("the marks at work: the list, the Pane's title and a message row, frozen mid-turn", async () => {
  const app = await open("./avatar-b-working-harness.tsx", {
    platform: "macos" as const,
    width: 1240,
    height: 840,
    clock: { time: FIXED_TIME },
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:avatar-b-working-harness");
  await app.waitFor("id:composer", { timeout: 30000 });

  // A turn under way: the reply has begun and has not ended.
  await app.type("id:composer", "Read the two files and run their tests");
  await app.keyboard.press("Return");
  await app.waitFor("id:bot-mark-working", { timeout: 30000 });
  // Three seconds into the turn, so its elapsed label reads a steady "3s".
  await app.clock!.runFor(3000);
  // The two Bots with a turn running, the Pane's mark and the streaming row.
  expect(app.count("id:bot-mark-working")).toBeGreaterThanOrEqual(4);
  await both(app, "21-working-turn");

  // Another moment of the same turn: the breath at its stretch, the scan at its end.
  await app.press("id:hold-1200");
  await app.wait(250);
  await both(app, "22-working-turn-1200");

  // The one mark that is not working keeps still on the third row.
  expect(app.count("id:list-row-shell")).toBe(1);
}, 240000);

test("reduced motion: the same turn, and no mark moves at all", async () => {
  const app = await open("./avatar-b-working-harness.tsx", {
    platform: "macos" as const,
    width: 1240,
    height: 840,
    clock: { time: FIXED_TIME },
    reducedMotion: true,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:avatar-b-working-harness");
  await app.waitFor("id:composer", { timeout: 30000 });
  await app.type("id:composer", "Read the two files and run their tests");
  await app.keyboard.press("Return");
  await app.waitFor("id:bot-mark-working", { timeout: 30000 });
  await app.clock!.runFor(3000);
  // Held at 1200 ms the picture would differ from 0 if anything moved: with
  // reduced motion the moment the clock is asked for is 0, whatever is held.
  await app.press("id:hold-1200");
  await app.wait(250);
  await both(app, "31-reduced-motion");
  expect(app.count("id:bot-mark-working")).toBeGreaterThanOrEqual(4);
}, 240000);

test("a change of form in the picker: round to star, its start, its middle and its end", async () => {
  const app = await open("./avatar-b-picker-harness.tsx", {
    platform: "macos" as const,
    width: 900,
    height: 620,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:avatar-b-picker-harness");

  // The clock stands at 0, so the press draws the old form first; the frames
  // after it are the ease the app draws (about a sixth of a second each way).
  await app.press("id:bot-shape-star");
  await both(app, "41-morph-start");
  await app.press("id:moment-middle");
  await both(app, "42-morph-middle");
  await app.press("id:moment-end");
  await both(app, "43-morph-end");
  expect(app.count("id:bot-shape-star")).toBe(1);
}, 180000);

test("the real Bot's details: the picker in the dialog, after a change of shape", async () => {
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1280,
    height: 860,
    clock: {},
    storage: storageOf(shellRegistry()),
  });
  if (!(await graphical(app))) return;
  await app.waitFor(`label:${t("panel.botDetails", { name: "Ada" })}`);
  await app.press(`label:${t("panel.botDetails", { name: "Ada" })}`);
  await app.waitFor("id:bot-details");
  await app.press("id:bot-shape-star");
  await app.clock!.runFor(400);
  await both(app, "44-bot-details-star");
  expect(app.count("id:bot-details")).toBe(1);
}, 180000);
