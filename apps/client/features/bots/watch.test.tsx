/**
 * Another Device renames a Bot: `watch` pushes the snapshot and the Navigator
 * shows the new name without a reload. The plugin's order is kept, so the
 * Main Bot stays first.
 */
import { expect, test } from "nsh/test";

import { open } from "../../test/open";

test("a watch snapshot renames a Bot in the Navigator, and the Main Bot stays first", async () => {
  const app = await open("./watch-harness.tsx", {
    platform: "web" as const,
    width: 400,
    height: 700,
    clock: {},
  });
  await app.waitFor("label:Main Bot");
  await app.waitFor("label:Ada");
  const before = app.texts().filter((text) => text === "Main Bot" || text === "Ada");
  expect(before[0]).toBe("Main Bot");
  expect(before[1]).toBe("Ada");

  await app.press("id:other-device");
  await app.waitFor("label:Ada L");
  expect(app.shows("label:Ada")).toBe(false);
  const after = app.texts().filter((text) => text === "Main Bot" || text === "Ada L");
  expect(after[0]).toBe("Main Bot");
  expect(after[1]).toBe("Ada L");
});
