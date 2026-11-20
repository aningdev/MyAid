/**
 * Screenshots over a seeded registry: the Bot marks in the sidebar, the
 * New Bot dialog, the ⌘K palette and a row's context menu. The fixture lives in
 * the app's isolated test storage, never the real `~/.dsh-bot`:
 *
 *   nsh test screens/navigator-marks.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

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
  renameSegment,
  serializeRegistry,
  type BotRegistry,
} from "../features/bots/model";
import { REGISTRY_STORAGE_KEY } from "../features/bots/store";
import { open } from "../test/open";
import { workspaceStorage, workspaceRow } from "../test/workspaces";
import { graphical, shoot } from "./shots";

/** Ada with a release-notes Session, and Iota as a second Bot. */
function fixture(): BotRegistry {
  const created = claimSegment(
    initializeBot(
      createBot(
        createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
        { name: "Ada", templateId: "tmpl" },
        "bot",
      ),
      "bot",
    ),
    "bot",
    "s1",
    "ws-work",
  );
  const withIota = createBot(created, { name: "Iota", templateId: "tmpl" }, "bot2");
  return renameSegment(withIota, "bot", "s1", "Release notes for 0.5");
}

function fixturePrefs(): string {
  const prefs = emptyShellPrefs();
  prefs.pins = ["bot"];
  return serializeShellPrefs(prefs);
}

test("marks, New Bot, palette and context menu", async () => {
  const app = await open("../App.tsx", {
    width: 1440,
    height: 900,
    storage: {
      [REGISTRY_STORAGE_KEY]: serializeRegistry(fixture()),
      [SHELL_PREFS_STORAGE]: fixturePrefs(),
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
  await app.waitFor("text:Pin");
  await shoot(app, "02-sidebar-marks.png");
  expect(app.texts()).toContain("Iota");

  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-dialog");
  await shoot(app, "03-new-bot-dialog.png");
  await app.press("label:Cancel");

  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", "Ada");
  await shoot(app, "04-command-palette.png");
  await app.keyboard.press("mod+k");

  await app.rightClick("label:Iota");
  await app.waitFor("text:Bot details…");
  await shoot(app, "05-context-menu.png");
});
