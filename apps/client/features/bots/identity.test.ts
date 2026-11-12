import { expect, test } from "nsh/test";

import { BOT_COLORS, BOT_GLYPHS, defaultIdentity, nextIdentity, readIdentity } from "./identity";

test("default identity is stable for a Bot and varies across Bots", () => {
  expect(defaultIdentity("bot")).toEqual(defaultIdentity("bot"));
  expect(BOT_COLORS).toContain(defaultIdentity("bot").color);
  expect(BOT_GLYPHS).toContain(defaultIdentity("bot").glyph);
  const many = ["a", "b", "c", "d", "e", "f", "g", "h"].map(defaultIdentity);
  expect(new Set(many.map((identity) => identity.color)).size).toBeGreaterThan(1);
});

test("an unknown or missing identity reads as the default", () => {
  expect(readIdentity(null, "bot")).toEqual(defaultIdentity("bot"));
  expect(readIdentity({ color: "burgundy", glyph: "orbit" }, "bot")).toEqual(
    defaultIdentity("bot"),
  );
  expect(readIdentity({ color: "rose", glyph: "hexagon" }, "bot")).toEqual(defaultIdentity("bot"));
  expect(readIdentity({ color: "rose", glyph: "orbit" }, "bot")).toEqual({
    color: "rose",
    glyph: "orbit",
  });
});

test("a first guess cycles through the palette", () => {
  expect(nextIdentity(0)).toEqual({ color: BOT_COLORS[0], glyph: BOT_GLYPHS[0] });
  expect(nextIdentity(BOT_COLORS.length)).toEqual({
    color: BOT_COLORS[0],
    glyph: BOT_GLYPHS[0],
  });
});
