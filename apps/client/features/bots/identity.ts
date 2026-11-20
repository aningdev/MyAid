/**
 * A Bot's identity: an accent color, and dsh-bot's own little character — a body
 * shape and a face — drawn from the two names. The Registry stores the names,
 * not a picture, so the mark follows the UI's palette and dark mode.
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

/** The bodies of the character. */
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

/** A Bot's accent, falling back to the first color for an unknown key. */
export function botColor(identity: BotIdentity): string {
  return BOT_COLOR_HEX[identity.color] ?? BOT_COLOR_HEX.indigo;
}

/** A stable mark for a Bot id, so the same Bot looks the same on every launch. */
export function defaultIdentity(seed: string): BotIdentity {
  const hash = fnv1a(seed);
  const color = BOT_COLORS[hash % BOT_COLORS.length] ?? "indigo";
  const shape = BOT_SHAPES[Math.floor(hash / BOT_COLORS.length) % BOT_SHAPES.length] ?? "round";
  const face =
    BOT_FACES[Math.floor(hash / (BOT_COLORS.length * BOT_SHAPES.length)) % BOT_FACES.length] ??
    "calm";
  return { color, shape, face };
}

/** The next identity in the palette, for a picker's first guess. */
export function nextIdentity(index: number): BotIdentity {
  const color = BOT_COLORS[index % BOT_COLORS.length] ?? "indigo";
  const shape = BOT_SHAPES[index % BOT_SHAPES.length] ?? "round";
  const face = BOT_FACES[index % BOT_FACES.length] ?? "calm";
  return { color, shape, face };
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
