/**
 * A Bot's identity: an accent color, and MyAid's own little character — a body
 * shape and a face — drawn from the two names. The registry stores the names,
 * not a picture, so the mark follows the UI's palette and dark mode.
 *
 * v4 and older files stored a `glyph` instead of a `shape`: it reads through
 * the one table below, and every write puts `glyph` back beside `shape`, so an
 * older client still opens the file and finds the shape it drew.
 *
 * Every key is read on its own: one unknown name costs that one choice, never
 * the whole identity, so a file from a newer client keeps what this one knows.
 */
import type { MessageKey } from "../../lib/i18n";

export const BOT_COLORS = [
  "indigo",
  "sky",
  "teal",
  "lime",
  "amber",
  "coral",
  "rose",
  "violet",
] as const;

export type BotColor = (typeof BOT_COLORS)[number];

/** The bodies of the character, one per v4 glyph so every old mark maps over. */
export const BOT_SHAPES = [
  "round",
  "square",
  "pebble",
  "triangle",
  "dome",
  "drop",
  "flower",
  "star",
] as const;

export type BotShape = (typeof BOT_SHAPES)[number];

/** The expressions the two eyes take. */
export const BOT_FACES = ["calm", "happy", "wink", "sleepy", "curious", "focus"] as const;

export type BotFace = (typeof BOT_FACES)[number];

/** The v4 glyphs, still read and still written beside a shape. */
export const BOT_GLYPHS = [
  "spark",
  "orbit",
  "prism",
  "arc",
  "wave",
  "petal",
  "bolt",
  "weave",
] as const;

export type BotGlyph = (typeof BOT_GLYPHS)[number];

/** What a v4 glyph becomes; the one table the migration and its reverse share. */
export const SHAPE_OF_GLYPH: Record<BotGlyph, BotShape> = {
  orbit: "round",
  weave: "square",
  wave: "pebble",
  prism: "triangle",
  arc: "dome",
  bolt: "drop",
  petal: "flower",
  spark: "star",
};

/** The v4 glyph written beside a shape, so an older client finds its mark. */
export const GLYPH_OF_SHAPE = Object.fromEntries(
  BOT_GLYPHS.map((glyph) => [SHAPE_OF_GLYPH[glyph], glyph]),
) as Record<BotShape, BotGlyph>;

export type BotIdentity = {
  color: BotColor;
  shape: BotShape;
  face: BotFace;
};

/** The accent of each color, the body's fill on the light and the dark surface. */
export const BOT_COLOR_HEX: Record<BotColor, string> = {
  indigo: "#6C63F0",
  sky: "#2D8CF0",
  teal: "#12A594",
  lime: "#5C9E2E",
  amber: "#C98A12",
  coral: "#E0603C",
  rose: "#D64B7C",
  violet: "#9A57E0",
};

export const BOT_COLOR_LABELS: Record<BotColor, MessageKey> = {
  indigo: "bot.color.indigo",
  sky: "bot.color.sky",
  teal: "bot.color.teal",
  lime: "bot.color.lime",
  amber: "bot.color.amber",
  coral: "bot.color.coral",
  rose: "bot.color.rose",
  violet: "bot.color.violet",
};

export const BOT_SHAPE_LABELS: Record<BotShape, MessageKey> = {
  round: "bot.shape.round",
  square: "bot.shape.square",
  pebble: "bot.shape.pebble",
  triangle: "bot.shape.triangle",
  dome: "bot.shape.dome",
  drop: "bot.shape.drop",
  flower: "bot.shape.flower",
  star: "bot.shape.star",
};

export const BOT_FACE_LABELS: Record<BotFace, MessageKey> = {
  calm: "bot.face.calm",
  happy: "bot.face.happy",
  wink: "bot.face.wink",
  sleepy: "bot.face.sleepy",
  curious: "bot.face.curious",
  focus: "bot.face.focus",
};

export function isBotColor(value: unknown): value is BotColor {
  return typeof value === "string" && (BOT_COLORS as readonly string[]).includes(value);
}

export function isBotShape(value: unknown): value is BotShape {
  return typeof value === "string" && (BOT_SHAPES as readonly string[]).includes(value);
}

export function isBotFace(value: unknown): value is BotFace {
  return typeof value === "string" && (BOT_FACES as readonly string[]).includes(value);
}

export function isBotGlyph(value: unknown): value is BotGlyph {
  return typeof value === "string" && (BOT_GLYPHS as readonly string[]).includes(value);
}

/** A Bot's accent, falling back to the first color for an unknown key. */
export function botColor(identity: BotIdentity): string {
  return BOT_COLOR_HEX[identity.color] ?? BOT_COLOR_HEX.indigo;
}

/**
 * The identity a Bot gets when it has none: a stable pick from its id, so a
 * migrated registry and a fresh Bot both look the same on every launch.
 */
export function defaultIdentity(seed: string): BotIdentity {
  const hash = fnv1a(seed);
  const color = BOT_COLORS[hash % BOT_COLORS.length] ?? "indigo";
  const shape = BOT_SHAPES[Math.floor(hash / BOT_COLORS.length) % BOT_SHAPES.length] ?? "round";
  const face =
    BOT_FACES[Math.floor(hash / (BOT_COLORS.length * BOT_SHAPES.length)) % BOT_FACES.length] ??
    "calm";
  return { color, shape, face };
}

/**
 * A stored identity. Each of its three names is read on its own: the color and
 * the face as stored, the shape as stored or through its v4 glyph, and only
 * the choice that is unknown falls back to this Bot's default.
 */
export function readIdentity(value: unknown, seed: string): BotIdentity {
  const fallback = defaultIdentity(seed);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    color: isBotColor(record.color) ? record.color : fallback.color,
    shape: readShape(record, fallback.shape),
    face: isBotFace(record.face) ? record.face : fallback.face,
  };
}

/** The identity as it goes to disk: the shape, and the v4 glyph beside it. */
export function storedIdentity(identity: BotIdentity): BotIdentity & { glyph: BotGlyph } {
  return { ...identity, glyph: GLYPH_OF_SHAPE[identity.shape] };
}

/** The next identity in the palette, for a picker's first guess. */
export function nextIdentity(index: number): BotIdentity {
  const color = BOT_COLORS[index % BOT_COLORS.length] ?? "indigo";
  const shape = BOT_SHAPES[index % BOT_SHAPES.length] ?? "round";
  const face = BOT_FACES[index % BOT_FACES.length] ?? "calm";
  return { color, shape, face };
}

/** The shape of a stored Bot: its own, else its v4 glyph's, else the default. */
function readShape(record: Record<string, unknown>, fallback: BotShape): BotShape {
  if (isBotShape(record.shape)) return record.shape;
  if (isBotGlyph(record.glyph)) return SHAPE_OF_GLYPH[record.glyph];
  return fallback;
}

/** FNV-1a, 32 bits: a small stable hash for default identities. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
