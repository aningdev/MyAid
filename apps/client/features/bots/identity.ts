/**
 * A Bot's identity: an accent color and a geometric glyph in a rounded tile.
 * MyAid's own marks (no character art); the registry stores the two names,
 * not a picture, so the look follows the UI's palette and dark mode.
 *
 * Every stored value is a key of the tables below. An unknown key reads as
 * the Bot's default, so an older or a newer file still opens.
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

export type BotIdentity = {
  color: BotColor;
  glyph: BotGlyph;
};

/** The accent of each color, readable on the light and the dark tile. */
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

export function isBotColor(value: unknown): value is BotColor {
  return typeof value === "string" && (BOT_COLORS as readonly string[]).includes(value);
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
  const glyph = BOT_GLYPHS[Math.floor(hash / BOT_COLORS.length) % BOT_GLYPHS.length] ?? "spark";
  return { color, glyph };
}

/** A stored identity, both keys known; anything else is the default. */
export function readIdentity(value: unknown, seed: string): BotIdentity {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return defaultIdentity(seed);
  }
  const record = value as Record<string, unknown>;
  if (!isBotColor(record.color) || !isBotGlyph(record.glyph)) return defaultIdentity(seed);
  return { color: record.color, glyph: record.glyph };
}

/** The next identity in the palette, for a picker's first guess. */
export function nextIdentity(index: number): BotIdentity {
  const color = BOT_COLORS[index % BOT_COLORS.length] ?? "indigo";
  const glyph = BOT_GLYPHS[index % BOT_GLYPHS.length] ?? "spark";
  return { color, glyph };
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
