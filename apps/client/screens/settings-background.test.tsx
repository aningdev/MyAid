/**
 * Settings › Background with the Host registered. The harness supplies the
 * control-channel facts, so no Host is needed; only the picture needs a
 * graphical target:
 *
 *   nsh test screens/settings-background.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical, shoot, SHOTS_A1 } from "./shots";

test("the Background panel shows the Host registered", async () => {
  const app = await open("../features/settings/settings-harness.tsx", {
    platform: "macos" as const,
    width: 1200,
    height: 820,
  });
  if (!(await graphical(app))) return;

  await app.press("label:Settings");
  await app.waitFor("id:settings-overlay", { timeout: 30000 });
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-background", { timeout: 30000 });
  await app.press("label:Enable");
  await app.waitUntil(() => app.shows("id:settings-host-phase >> text:Registered"));

  await app.wait(300);
  await shoot(app, "settings-background.png", SHOTS_A1);
  expect(app.texts().filter((text) => text === "Registered").length).toBe(1);
  expect(app.texts()).not.toContain("Full");
});
