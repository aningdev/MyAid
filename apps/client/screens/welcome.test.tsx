/**
 * The first launch, with no registry and so no Bots. Move
 * ~/.myaid/registry/bots.json aside (and put it back), then run on a
 * graphical target:
 *
 *   nsh test screens/welcome.test.tsx --target macos
 */
import { expect, open, test } from "nsh/test";

import { graphical, shoot } from "./shots";

test("the welcome state with no Bots", async () => {
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;
  await app.waitFor("text:Welcome to MyAid");
  await shoot(app, "01-welcome.png");
  expect(app.shows("label:Create your first Bot")).toBe(true);
});
