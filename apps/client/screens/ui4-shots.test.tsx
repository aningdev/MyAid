/**
 * Batch 4 of the shadcn-nsh copies: the Navigator's search, the Composer and the
 * Pane header's directory as `InputGroup`s, the Pane title's field, a Bot's
 * plugin rows as `Switch`es, and the image viewer. Both appearances.
 *
 *   mkdir -p ~/.dsh-bot-dev/shots/pi-shots-ui4
 *   nsh test screens/ui4-shots.test.tsx --target macos
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
import { graphical, shoot, SHOTS_UI4 } from "./shots";

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

function shellStorage(): Record<string, string> {
  return {
    ...botsStorage(fixture()),
    [SHELL_PREFS_STORAGE]: serializeShellPrefs(emptyShellPrefs()),
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
  await shoot(app, `${name.replace(".png", "")}-light.png`, SHOTS_UI4);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-dark.png`, SHOTS_UI4);
  await app.setColorScheme("light");
}

const LONG_DRAFT =
  "A draft the composer grows with: it wraps over several lines, so the group that draws the " +
  "field is as tall as the text inside it, and the row of controls stays under the text it " +
  "belongs to rather than beside it.";

test("the Navigator's search, the Composer with a long draft, the header's field", async () => {
  // The clock is manual so the two presses below land as one double press: on
  // a real clock each press step waits out the quiet window (2 s while the
  // Pane keeps drawing), well past the 500 ms the platforms count a second
  // click within, and the title's field never opens.
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
    clock: {},
    storage: shellStorage(),
  });
  if (!(await graphical(app))) return;
  await app.waitFor("label:Cleo");

  // The Navigator's search takes the keys (⌘F), draws one ring on its group,
  // and filters as it goes.
  await app.keyboard.press("mod+f");
  await app.wait(200);
  await app.type("id:nav-search", "cle");
  await both(app, "21-navigator-search.png");
  expect(app.texts()).toContain("Cleo");
  expect(app.texts()).not.toContain("Ada");
  expect(app.texts()).not.toContain("Bob");
  await app.press(`label:${t("nav.clearSearch")}`);

  // The Composer takes a long draft and grows with it: one ring around the
  // whole pill, the controls under the text.
  await app.press("label:Ada");
  await app.waitFor("id:chat", { timeout: 30000 });
  await app.type("id:composer", LONG_DRAFT);
  await both(app, "22-composer-long.png");
  expect(app.value("id:composer")).toBe(LONG_DRAFT);

  // A new working directory, in the header's group.
  await app.press("id:session-workspace");
  await app.waitFor("id:session-workspace-input", { timeout: 10000 });
  await both(app, "23-header-field.png");
  expect(app.value("id:session-workspace-input")).toBe("/work/ada");
}, 180000);

test("a Bot's plugin rows are switches, on and off", async () => {
  const app = await open("../features/bots/bot-details-harness.tsx", {
    platform: "web" as const,
    width: 1200,
    height: 860,
    storage: {
      ...botsStorage(fixture()),
      ...workspaceStorage({
        rows: [
          workspaceRow({
            id: "ws-work",
            path: "/work/dsh-bot",
            title: "dsh-bot",
            sessionIds: ["s1"],
          }),
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
  await app.press("Plugins");
  await app.waitFor("text:@deepseek-ai/dsh-tool-bash", { timeout: 30000 });

  // One row is turned off so the picture holds both states.
  await app.press(`label:${t("bot.plugins.toggle", { name: "Present" })}`);
  await both(app, "31-plugin-switches.png");
  expect(app.texts()).toContain("@deepseek-ai/dsh-tool-present");
}, 120000);

test("the Pane title's field, and the image viewer", async () => {
  // The clock is manual so the two presses below land as one double press: on
  // a real clock each press step waits out the quiet window (2 s while the
  // Pane keeps drawing), well past the 500 ms the platforms count a second
  // click within, and the title's field never opens.
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
    clock: {},
    storage: shellStorage(),
  });
  if (!(await graphical(app))) return;
  await app.waitFor("label:Cleo");
  await app.press("label:Ada");
  await app.waitFor("id:chat", { timeout: 30000 });

  // A double press on the title turns it into the group's field.
  const title = "id:chat >> text:Ada · Untitled context";
  await app.press(title);
  await app.press(title);
  await app.waitFor("id:session-title", { timeout: 3000 });
  await both(app, "41-title-field.png");
  await app.clear("id:session-title");
  await app.type("id:session-title", "Notes for the release");
  await app.submit("id:session-title");
  await app.waitUntil(() => app.shows("text:Ada · Notes for the release"), { timeout: 10000 });
}, 120000);

test("the image viewer opens, closes on Escape, and opens again", async () => {
  const app = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:composer", { timeout: 30000 });

  await app.type("id:composer", "picture");
  await app.keyboard.press("Return");
  await app.press("label:dsh-bot");
  await app.waitFor("id:image-viewer", { timeout: 30000 });
  await both(app, "51-image-viewer.png");

  // Escape closes it, and a press on the picture opens it again: the scrim's
  // own press cannot be walked here, since a step presses a view's middle and
  // the picture is drawn over the middle of the scrim.
  await app.keyboard.press("Escape");
  await app.waitUntil(() => !app.shows("id:image-viewer"), { timeout: 10000 });
  expect(app.shows("id:image-viewer")).toBe(false);
  await app.press("label:dsh-bot");
  await app.waitFor("id:image-viewer", { timeout: 30000 });
  expect(app.shows("id:image-viewer")).toBe(true);
  await app.press(`label:${t("chat.closeImage")}`);
  await app.waitUntil(() => !app.shows("id:image-viewer"), { timeout: 10000 });
}, 120000);
