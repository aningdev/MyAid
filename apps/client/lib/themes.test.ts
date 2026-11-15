/**
 * The app's colour choices: the build-time theme (`null`) and the library's
 * own one, `selectTheme` switching the running app, and an id it does not
 * carry going back to the build-time theme rather than to nothing.
 */
import { expect, test } from "nsh/test";

import { currentTheme } from "./theme";
import { applyTheme, themeById, themePref, THEMES } from "./themes";

test("the list is the build-time theme and the one `add theme-default` copied in", () => {
  expect(THEMES.map((choice) => choice.id)).toEqual([null, "default"]);
  expect(themeById(null)).toBe(null);
  expect(themeById("default")?.id).toBe("default");
  // An id this build does not carry (another build's theme) is the build-time theme.
  expect(themeById("shadcn")).toBe(null);
});

test("a pick switches the theme in use, and nothing else does", () => {
  applyTheme("default");
  expect(currentTheme()).toBe("default");
  expect(themePref()).toBe("default");

  applyTheme(null);
  expect(currentTheme()).toBe(null);

  // An id no choice names is the build-time theme, never a theme of its own.
  applyTheme("shadcn");
  expect(currentTheme()).toBe(null);
  expect(themePref()).toBe(null);
});
