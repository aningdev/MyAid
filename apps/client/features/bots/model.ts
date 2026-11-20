import { t } from "../../lib/i18n";
/**
 * Registry as the Client shows it. The `bots` plugin owns every change; this
 * module only reads a snapshot (preset binding, segment ownership, Main Bot).
 */
import type { BotIdentity } from "./identity";

/** Wire version of the Registry the plugin stores. */
export const REGISTRY_VERSION = 6 as const;

/**
 * Id of the Main Bot in a plugin snapshot. The plugin keeps this Bot first
 * and rejects archiving or deleting it (`packages/bots` README).
 */
export const MAIN_BOT_ID = "bots-main";

export type BotTemplate = {
  id: string;
  name: string;
  /** DSH Agent preset id. Not a snapshot of the preset body. */
  presetId: string;
};

export type BotStatus = "draft" | "ready";

/**
 * One segment of a Bot's long conversation: one dsh Session, in the Workspace
 * of the directory it ran in. The event log, its archive flag and its pin stay
 * in dsh; `title` is the person's own label, because dsh's Session listing
 * carries no title.
 */
export type Segment = {
  sessionId: string;
  workspaceId: string;
  title: string | null;
};

export type Bot = {
  id: string;
  name: string;
  /** One line on what this Bot is for (Bot Settings › Profile). */
  description: string | null;
  templateId: string;
  defaultModel: string | null;
  /** Default reasoning effort id of the selected model (`Runs with`). */
  defaultThinking: string | null;
  /** Directory offered when this Bot starts its next segment. */
  defaultWorkspacePath: string | null;
  /** Stays true after any segment existed, so the Bot cannot be deleted. */
  hadDialogue: boolean;
  status: BotStatus;
  /** Preset id captured from the template at initialization. */
  boundPresetId: string | null;
  /** Set when this Bot's capabilities diverge. The plugin owns the preset body. */
  derivedPresetId: string | null;
  /** Archived by the person: out of the Navigator list, still openable by search. */
  archived: boolean;
  /** The mark shown in the Navigator, the chat and Bot details. */
  identity: BotIdentity;
  /** The Bot's one long conversation, oldest segment first. */
  segments: Segment[];
};

export type BotRegistry = {
  version: typeof REGISTRY_VERSION;
  templates: BotTemplate[];
  bots: Bot[];
};

/** How a Bot stands to its template's preset: the words are the view's. */
export type PresetBinding = "inherit" | "bound" | "custom";

export function emptyRegistry(): BotRegistry {
  return { version: REGISTRY_VERSION, templates: [], bots: [] };
}

export function newId(): string {
  return crypto.randomUUID();
}

/** True when this Bot is the Owner's Main Bot. */
export function isMainBot(bot: { id: string }): boolean {
  return bot.id === MAIN_BOT_ID;
}

/** Drafts follow the template's current preset. Ready Bots keep `boundPresetId` until a derived preset is set. */
export function resolveAgentPreset(bot: Bot, template: BotTemplate | null): string {
  const derived = present(bot.derivedPresetId);
  if (derived) return derived;
  const bound = present(bot.boundPresetId);
  if (bound) return bound;
  if (!template || template.id !== bot.templateId) {
    throw new Error(t("registry.templateGone"));
  }
  return template.presetId;
}

/** Preset id a later Agent create/resume should pass for this Bot. */
export function presetForBot(registry: BotRegistry, botId: string): string {
  const bot = registry.bots.find((item) => item.id === botId);
  if (!bot) throw new Error(t("workspace.botMissing"));
  const template = registry.templates.find((item) => item.id === bot.templateId) ?? null;
  return resolveAgentPreset(bot, template);
}

export function presetBinding(
  bot: Bot,
  template: BotTemplate | null,
): { presetId: string; binding: PresetBinding } {
  const presetId = resolveAgentPreset(bot, template);
  if (present(bot.derivedPresetId)) return { presetId, binding: "custom" };
  if (present(bot.boundPresetId)) return { presetId, binding: "bound" };
  return { presetId, binding: "inherit" };
}

/** Which Bot owns a Session, and the segment it is. */
export function segmentOwner(
  registry: BotRegistry,
  sessionId: string,
): { bot: Bot; segment: Segment } | null {
  for (const bot of registry.bots) {
    const segment = bot.segments.find((item) => item.sessionId === sessionId);
    if (segment) return { bot, segment };
  }
  return null;
}

function present(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
