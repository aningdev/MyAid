/**
 * B5 screenshots over a seeded registry: the Bot marks in the sidebar, the
 * New Bot sheet, the ⌘K palette and a row's context menu. Run with a HOME
 * whose ~/.myaid holds the fixture registry and prefs, on a graphical target:
 *
 *   HOME=/tmp/myaid-b5-fixture nsh test screens/b5-shot.test.tsx --target macos
 */
import { expect, open, test } from "nsh/test";

import { graphical, shoot } from "./shots";

test("B5: marks, New Bot, palette and context menu", async () => {
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;

  await app.waitFor("role:treeitem[Ada]");
  await app.waitFor("role:treeitem[Release notes for 0.5]");
  await shoot(app, "02-sidebar-marks.png");
  expect(app.texts()).toContain("Iota");

  await app.keyboard.press("mod+shift+n");
  await app.waitFor("id:new-bot-sheet");
  await shoot(app, "03-new-bot-sheet.png");
  await app.press("label:Cancel");

  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", "release");
  await shoot(app, "04-command-palette.png");
  await app.keyboard.press("mod+k");

  await app.rightClick("text:Release notes for 0.5 >> nth=0");
  await app.waitFor("text:Archive Session");
  await shoot(app, "05-context-menu.png");
});
