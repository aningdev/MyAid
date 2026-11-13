/**
 * The first launch, with no registry and so no Bots. The test app's storage is
 * empty, never the real `~/.myaid`, so this runs on a graphical target as is:
 *
 *   nsh test screens/welcome.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical, shoot } from "./shots";

test("the welcome state with no Bots", async () => {
  const app = await open("../App.tsx", { width: 1440, height: 900 });
  if (!(await graphical(app))) return;
  await app.waitFor("text:Welcome to MyAid");
  await shoot(app, "01-welcome.png");
  expect(app.shows("label:Create your first Bot")).toBe(true);
});
