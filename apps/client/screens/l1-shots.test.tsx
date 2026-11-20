/**
 * The L1 shell's pictures: the Bot list with its Pin group, three Panes, the
 * Bot details modal and the Settings overlay. The registry and the pins are
 * seeded in the app's isolated test storage, never the real `~/.dsh-bot`:
 *
 *   nsh test screens/l1-shots.test.tsx --target macos
 *
 * A headless run stops at the picture probe. The working dot needs a live
 * Host; `bot-app.smoke.test.tsx` takes that one.
 */
import { expect, test } from "nsh/test";

import {
  emptyShellPrefs,
  serializeShellPrefs,
  SHELL_PREFS_STORAGE,
} from "../components/shell/prefs";
import { emptyRegistry, type BotRegistry } from "../features/bots/model";
import {
  botsStorage,
  claimSegment,
  createBot,
  createTemplate,
  initializeBot,
} from "../test/bots-fixture";
import { open } from "../test/open";
import { workspaceStorage, workspaceRow } from "../test/workspaces";
import { graphical, shoot, SHOTS_L1 } from "./shots";

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

test("the list, three Panes, Bot details and Settings", async () => {
  const prefs = emptyShellPrefs();
  prefs.pins = ["ada", "bob"];
  const app = await open("../App.tsx", {
    width: 1440,
    height: 900,
    storage: {
      ...botsStorage(fixture()),
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
  await shoot(app, "01-list-with-pin.png", SHOTS_L1);
  expect(app.texts().indexOf("Pin")).toBeLessThan(app.texts().indexOf("Ada"));

  // Three Panes: Ada in the first, Bob and Cleo dragged in beside each other.
  await app.press("label:Ada");
  await app.waitFor("id:chat", { timeout: 30000 });
  await app.drag("label:Bob", { x: 220 });
  await app.waitFor("id:tab-panel-2", { timeout: 30000 });
  await app.drag("label:Cleo", { x: 220 });
  await app.waitFor("id:tab-panel-3", { timeout: 30000 });
  await shoot(app, "02-three-panes.png", SHOTS_L1);
  expect(app.count("id:chat")).toBe(3);

  // Bot details, opened from the third Pane's header.
  await app.press("label:Bot details: Cleo");
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await shoot(app, "03-bot-details.png", SHOTS_L1);
  await app.press("Cancel");
  await app.waitUntil(() => !app.shows("id:bot-details"));

  // Settings covers the Panes; Back puts them back untouched.
  await app.press("label:Settings");
  await app.waitFor("id:settings-overlay", { timeout: 30000 });
  await shoot(app, "04-settings.png", SHOTS_L1);
  await app.press("label:Back to Panes");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
  expect(app.count("id:chat")).toBe(3);
});
