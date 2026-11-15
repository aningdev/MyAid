import { expect, test } from "nsh/test";

import {
  BOT_COLORS,
  BOT_FACES,
  BOT_GLYPHS,
  BOT_SHAPES,
  GLYPH_OF_SHAPE,
  SHAPE_OF_GLYPH,
  defaultIdentity,
  nextIdentity,
  readIdentity,
  storedIdentity,
} from "./identity";

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

test("nothing stored reads as the default", () => {
  expect(readIdentity(null, "bot")).toEqual(defaultIdentity("bot"));
  expect(readIdentity("rose", "bot")).toEqual(defaultIdentity("bot"));
  expect(readIdentity([], "bot")).toEqual(defaultIdentity("bot"));
});

test("a v4 glyph keeps its color and maps to its shape", () => {
  expect(readIdentity({ color: "teal", glyph: "bolt" }, "bot")).toEqual({
    color: "teal",
    shape: "drop",
    face: defaultIdentity("bot").face,
  });
  // Every old glyph has a shape, and every shape writes one back.
  for (const glyph of BOT_GLYPHS) {
    const identity = readIdentity({ color: "rose", glyph }, "bot");
    expect(identity.shape).toBe(SHAPE_OF_GLYPH[glyph]);
    expect(GLYPH_OF_SHAPE[identity.shape]).toBe(glyph);
  }
});

test("each key is read on its own: one unknown name costs one choice", () => {
  // A shape this client does not know: the old glyph still says what it was.
  expect(readIdentity({ color: "teal", shape: "bogus", glyph: "bolt" }, "bot")).toEqual({
    color: "teal",
    shape: "drop",
    face: defaultIdentity("bot").face,
  });
  // An unknown color keeps the shape and the face that are known.
  expect(readIdentity({ color: "bogus", shape: "round", face: "wink" }, "bot")).toEqual({
    color: defaultIdentity("bot").color,
    shape: "round",
    face: "wink",
  });
  // An unknown face keeps the rest.
  expect(readIdentity({ color: "sky", shape: "star", face: "smug" }, "bot")).toEqual({
    color: "sky",
    shape: "star",
    face: defaultIdentity("bot").face,
  });
  // Nothing known: the Bot's own default.
  expect(readIdentity({ color: "burgundy", glyph: "hexagon" }, "bot")).toEqual(
    defaultIdentity("bot"),
  );
});

test("a stored identity goes to disk with its v4 glyph", () => {
  const identity = { color: "lime", shape: "flower", face: "sleepy" } as const;
  expect(storedIdentity(identity)).toEqual({
    color: "lime",
    shape: "flower",
    face: "sleepy",
    glyph: "petal",
  });
  // The file an older client reads has the same three names and the glyph.
  expect(readIdentity(storedIdentity(identity), "bot")).toEqual(identity);
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
