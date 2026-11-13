/**
 * Settings' four groups in both appearances, over the fake Host the settings
 * harness ships. A headless run stops at the picture probe; on a graphical
 * target it saves eight PNGs:
 *
 *   nsh test screens/settings-shots.test.tsx --target macos
 */
import { test } from "nsh/test";

import { open } from "../test/open";
import { graphical, shoot, SHOTS_L3 } from "./shots";

const GROUPS = [
  { id: "providers", name: "providers" },
  { id: "general", name: "general" },
  { id: "background", name: "background" },
  { id: "about", name: "about" },
] as const;

test("each Settings group in light and dark", async () => {
  const app = await open("../features/settings/settings-harness.tsx", {
    platform: "macos" as const,
    width: 1200,
    height: 840,
  });
  if (!(await graphical(app))) return;
  await app.press("label:Settings");
  await app.waitFor("id:settings-overlay", { timeout: 30000 });

  for (const group of GROUPS) {
    await app.press(`id:settings-nav-${group.id}`);
    await app.waitFor(`id:settings-${group.id}`, { timeout: 30000 });
    await app.setColorScheme("light");
    await app.wait(250);
    await shoot(app, `settings-${group.name}-light.png`, SHOTS_L3);
    await app.setColorScheme("dark");
    await app.wait(250);
    await shoot(app, `settings-${group.name}-dark.png`, SHOTS_L3);
    await app.setColorScheme("light");
  }
});
