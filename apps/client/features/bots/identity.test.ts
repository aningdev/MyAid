import { expect, test } from "nsh/test";

import { BOT_COLORS, BOT_FACES, BOT_SHAPES, defaultIdentity, nextIdentity } from "./identity";

test("default identity is stable for a Bot and varies across Bots", () => {
  expect(defaultIdentity("bot")).toEqual(defaultIdentity("bot"));
  expect(BOT_COLORS).toContain(defaultIdentity("bot").color);
  expect(BOT_SHAPES).toContain(defaultIdentity("bot").shape);
  expect(BOT_FACES).toContain(defaultIdentity("bot").face);
  const many = ["a", "b", "c", "d", "e", "f", "g", "h"].map(defaultIdentity);
  expect(new Set(many.map((identity) => identity.color)).size).toBeGreaterThan(1);
  expect(new Set(many.map((identity) => identity.shape)).size).toBeGreaterThan(1);
  expect(new Set(many.map((identity) => identity.face)).size).toBeGreaterThan(1);
});

test("a first guess cycles through the palette", () => {
  expect(nextIdentity(0)).toEqual({
    color: BOT_COLORS[0],
    shape: BOT_SHAPES[0],
    face: BOT_FACES[0],
  });
  // Eight colors, eight shapes, six faces: 24 guesses bring every one round.
  expect(nextIdentity(24)).toEqual({
    color: BOT_COLORS[0],
    shape: BOT_SHAPES[0],
    face: BOT_FACES[0],
  });
  expect(nextIdentity(BOT_SHAPES.length).shape).toBe(BOT_SHAPES[0]);
  expect(nextIdentity(BOT_FACES.length).face).toBe(BOT_FACES[0]);
});
