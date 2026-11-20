/**
 * The product Registry: Bots, their templates, and each Bot's one long
 * conversation as segments. Pure data and pure writes; the file, its revision
 * and the watchers live in `store.ts`.
 */
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";
import { z } from "zod";

import type {} from "./types.ts";

/** File and wire version of the Registry this plugin owns. */
export const REGISTRY_VERSION = 6;

/** The one Bot every Owner has; always first and never archived or deleted. */
export const MAIN_BOT_ID = "bots-main";

/** Display name of the Main Bot. */
export const MAIN_BOT_NAME = "Main Bot";

/** The Main Bot's mark: steady, neutral and independent of its preset. */
export const MAIN_BOT_IDENTITY = { color: "indigo", shape: "round", face: "calm" } as const;

/** Prefix of preset ids this plugin derives for a Bot. */
export const DERIVED_PRESET_PREFIX = "bots-";

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
export const BOT_FACES = ["calm", "happy", "wink", "sleepy", "curious", "focus"] as const;

export const botIdentitySchema = z.object({
  color: z.enum(BOT_COLORS),
  shape: z.enum(BOT_SHAPES),
  face: z.enum(BOT_FACES),
});

export type BotIdentity = z.infer<typeof botIdentitySchema>;

export const botTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** dsh Agent preset id. Not a snapshot of the preset body. */
  presetId: z.string(),
});

export const segmentSchema = z.object({
  sessionId: z.string(),
  /** dsh Workspace id; this segment's path, title and order live there. */
  workspaceId: z.string(),
  /** The person's own label, because dsh's Session listing carries none. */
  title: z.string().nullable(),
});

export type Segment = z.infer<typeof segmentSchema>;

export const botSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  templateId: z.string(),
  defaultModel: z.string().nullable(),
  /** Default reasoning effort id of the selected model. */
  defaultThinking: z.string().nullable(),
  /** Directory offered when this Bot starts its next segment. */
  defaultWorkspacePath: z.string().nullable(),
  /** Stays true after any segment existed, so the Bot cannot be deleted. */
  hadDialogue: z.boolean(),
  status: z.enum(["draft", "ready"]),
  /** Preset id captured from the template at initialization. */
  boundPresetId: z.string().nullable(),
  /** Set when this Bot's capabilities diverge. This plugin owns the preset body. */
  derivedPresetId: z.string().nullable(),
  archived: z.boolean(),
  identity: botIdentitySchema,
  /** The Bot's one long conversation, oldest segment first. */
  segments: z.array(segmentSchema),
});

export type Bot = z.infer<typeof botSchema>;
export type BotTemplate = z.infer<typeof botTemplateSchema>;

export const registrySchema = z.object({
  version: z.literal(REGISTRY_VERSION),
  templates: z.array(botTemplateSchema),
  bots: z.array(botSchema),
});

export type BotRegistry = z.infer<typeof registrySchema>;

/** What the Registry file adds beside the Registry itself. */
export const registryFileSchema = registrySchema.extend({
  /** Monotonic across successful writes; a fresh Registry starts at 0. */
  revision: z.number().int().nonnegative(),
});

export type RegistryFile = z.infer<typeof registryFileSchema>;

export function emptyRegistry(): BotRegistry {
  return { version: REGISTRY_VERSION, templates: [], bots: [] };
}

/** Deterministic default mark for a new Bot, stable for the same id. */
export function defaultIdentity(seed: string): BotIdentity {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return {
    color: BOT_COLORS[hash % BOT_COLORS.length]!,
    shape: BOT_SHAPES[Math.floor(hash / BOT_COLORS.length) % BOT_SHAPES.length]!,
    face: BOT_FACES[Math.floor(hash / (BOT_COLORS.length * BOT_SHAPES.length)) % BOT_FACES.length]!,
  };
}

/** A template the Main Bot can bind without the person importing presets first. */
export type DefaultPreset = { id: string; name?: string };

/**
 * Ensure the Main Bot exists, is ready, is first and is not archived. Runs on
 * every load so a hand-edited file cannot hide it.
 */
export function ensureMainBot(registry: BotRegistry, preset: DefaultPreset): BotRegistry {
  const templates = ensuredTemplates(registry.templates, preset);
  const current = registry.bots.find((bot) => bot.id === MAIN_BOT_ID);
  const main =
    current === undefined
      ? {
          id: MAIN_BOT_ID,
          name: MAIN_BOT_NAME,
          description: null,
          templateId: preset.id,
          defaultModel: null,
          defaultThinking: null,
          defaultWorkspacePath: null,
          hadDialogue: false,
          status: "ready" as const,
          boundPresetId: preset.id,
          derivedPresetId: null,
          archived: false,
          identity: { ...MAIN_BOT_IDENTITY },
          segments: [],
        }
      : {
          ...current,
          archived: false,
          status: "ready" as const,
          templateId: current.templateId || preset.id,
          boundPresetId: current.boundPresetId ?? preset.id,
        };
  return {
    version: REGISTRY_VERSION,
    templates,
    bots: [main, ...registry.bots.filter((bot) => bot.id !== MAIN_BOT_ID)],
  };
}

function ensuredTemplates(templates: readonly BotTemplate[], preset: DefaultPreset): BotTemplate[] {
  const name = preset.name?.trim() || preset.id;
  const existing = templates.find((template) => template.id === preset.id);
  if (existing === undefined) {
    return [...templates, { id: preset.id, name, presetId: preset.id }];
  }
  if (existing.name === name) return [...templates];
  return templates.map((template) =>
    template.id === preset.id ? { ...template, name } : template,
  );
}

// Pure writes. Each returns a new Registry and throws `RemoteError` with a
// stable code; the service adds the revision and persists.
export type TemplateInput = { id: string; name: string; presetId: string };
export type TemplatePatch = { name?: string; presetId?: string };

export function createTemplate(registry: BotRegistry, input: TemplateInput): BotRegistry {
  const template = {
    id: input.id.trim(),
    name: requireName(input.name),
    presetId: requirePresetId(input.presetId),
  };
  if (!template.id) throw invalid("模板 id 不能为空。");
  if (registry.templates.some((item) => item.id === template.id)) {
    throw invalid(`模板 ${template.id} 已存在。`);
  }
  return { ...registry, templates: [...registry.templates, template] };
}

export function updateTemplate(
  registry: BotRegistry,
  id: string,
  patch: TemplatePatch,
): BotRegistry {
  const current = mustTemplate(registry, id);
  const next: BotTemplate = {
    id: current.id,
    name: patch.name === undefined ? current.name : requireName(patch.name),
    presetId: patch.presetId === undefined ? current.presetId : requirePresetId(patch.presetId),
  };
  return {
    ...registry,
    templates: registry.templates.map((item) => (item.id === id ? next : item)),
  };
}

export function deleteTemplate(registry: BotRegistry, id: string): BotRegistry {
  mustTemplate(registry, id);
  if (registry.bots.some((bot) => bot.templateId === id)) {
    throw invalid(`模板 ${id} 仍被 Bot 使用，不能删除。`);
  }
  return { ...registry, templates: registry.templates.filter((item) => item.id !== id) };
}

/** Upsert templates from dsh Agent presets; this plugin's derived presets stay out. */
export function importTemplates(
  registry: BotRegistry,
  presets: readonly { id: string; name?: string; broken?: string }[],
): BotRegistry {
  let next = registry;
  for (const preset of presets) {
    if (preset.broken) continue;
    const id = preset.id.trim();
    if (!id || id.startsWith(DERIVED_PRESET_PREFIX)) continue;
    const name = preset.name?.trim() || id;
    const existing = next.templates.find((item) => item.id === id);
    if (existing === undefined) {
      next = createTemplate(next, { id, name, presetId: id });
      continue;
    }
    if (existing.name === name && existing.presetId === id) continue;
    next = updateTemplate(next, id, { name, presetId: id });
  }
  return next;
}

export type BotInput = {
  id: string;
  name: string;
  description?: string | null;
  templateId: string;
  defaultModel?: string | null;
  defaultThinking?: string | null;
  defaultWorkspacePath?: string | null;
  identity?: BotIdentity;
};

export function createBot(registry: BotRegistry, input: BotInput): BotRegistry {
  const id = input.id.trim();
  if (!id) throw invalid("Bot id 不能为空。");
  if (id === MAIN_BOT_ID) throw invalid(`Bot id ${MAIN_BOT_ID} 归 Main Bot。`);
  if (registry.bots.some((bot) => bot.id === id)) throw invalid(`Bot ${id} 已存在。`);
  const template = requireTemplate(registry, input.templateId);
  const bot: Bot = {
    id,
    name: requireName(input.name),
    description: blankToNull(input.description ?? null),
    templateId: template.id,
    defaultModel: blankToNull(input.defaultModel ?? null),
    defaultThinking: blankToNull(input.defaultThinking ?? null),
    defaultWorkspacePath: blankToNull(input.defaultWorkspacePath ?? null),
    hadDialogue: false,
    status: "draft",
    boundPresetId: null,
    derivedPresetId: null,
    archived: false,
    identity: input.identity ?? defaultIdentity(id),
    segments: [],
  };
  return { ...registry, bots: [...registry.bots, bot] };
}

export type BotPatch = {
  name?: string;
  description?: string | null;
  templateId?: string;
  defaultModel?: string | null;
  defaultThinking?: string | null;
  defaultWorkspacePath?: string | null;
  identity?: BotIdentity;
};

export function updateBot(registry: BotRegistry, id: string, patch: BotPatch): BotRegistry {
  const bot = mustBot(registry, id);
  let templateId = bot.templateId;
  if (patch.templateId !== undefined && patch.templateId !== bot.templateId) {
    if (bot.status === "ready") {
      throw invalid(`Bot ${id} 已开始对话，不能更换模板。`);
    }
    templateId = requireTemplate(registry, patch.templateId).id;
  }
  const next: Bot = {
    ...bot,
    name: patch.name === undefined ? bot.name : requireName(patch.name),
    description: patch.description === undefined ? bot.description : blankToNull(patch.description),
    templateId,
    defaultModel:
      patch.defaultModel === undefined ? bot.defaultModel : blankToNull(patch.defaultModel),
    defaultThinking:
      patch.defaultThinking === undefined
        ? bot.defaultThinking
        : blankToNull(patch.defaultThinking),
    defaultWorkspacePath:
      patch.defaultWorkspacePath === undefined
        ? bot.defaultWorkspacePath
        : blankToNull(patch.defaultWorkspacePath),
    identity: patch.identity ?? bot.identity,
  };
  return replaceBot(registry, next);
}

/** Bind the template's preset id; no dsh call and no Workspace needed. */
export function initializeBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.status !== "draft") throw invalid(`Bot ${botId} 不是草稿，不能重新初始化。`);
  const template = requireTemplate(registry, bot.templateId);
  return replaceBot(registry, { ...bot, status: "ready", boundPresetId: template.presetId });
}

/** Claim a dsh Session as the next segment of a Bot's long conversation. */
export function claimSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  workspaceId: string,
): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.status !== "ready") throw invalid(`Bot ${botId} 尚未初始化，不能认领 Session。`);
  const id = sessionId.trim();
  if (!id) throw invalid("Session id 不能为空。");
  const workspace = workspaceId.trim();
  if (!workspace) throw invalid("Workspace id 不能为空。");
  if (segmentOwner(registry, id) !== null) throw invalid(`Session ${id} 已属于别的 Bot。`);
  return replaceBot(registry, {
    ...bot,
    hadDialogue: true,
    segments: [...bot.segments, { sessionId: id, workspaceId: workspace, title: null }],
  });
}

export function renameSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  title: string | null,
): BotRegistry {
  return mapSegment(registry, botId, sessionId, (segment) => ({
    ...segment,
    title: blankToNull(title),
  }));
}

/** Drop a segment whose dsh Session is already gone; `hadDialogue` stays set. */
export function releaseSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
): BotRegistry {
  const bot = mustBot(registry, botId);
  if (!bot.segments.some((segment) => segment.sessionId === sessionId)) {
    throw invalid(`Bot ${botId} 没有 Session ${sessionId} 的段。`);
  }
  return replaceBot(registry, {
    ...bot,
    segments: bot.segments.filter((segment) => segment.sessionId !== sessionId),
  });
}

/** Archive a Bot: it leaves the list, its conversation stays. */
export function archiveBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = writableBot(registry, botId);
  return bot.archived ? registry : replaceBot(registry, { ...bot, archived: true });
}

/** Bring an archived Bot back into the list. */
export function unarchiveBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  return bot.archived ? replaceBot(registry, { ...bot, archived: false }) : registry;
}

/** Delete a Bot that never had a segment. */
export function deleteBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = writableBot(registry, botId);
  if (bot.hadDialogue || bot.segments.length > 0) {
    throw invalid(`Bot ${botId} 已有对话，不能删除。`);
  }
  return { ...registry, bots: registry.bots.filter((item) => item.id !== botId) };
}

/** Record a per-Bot preset id; the service registers that preset itself. */
export function assignDerivedPreset(
  registry: BotRegistry,
  botId: string,
  presetId: string,
): BotRegistry {
  const bot = mustBot(registry, botId);
  return replaceBot(registry, { ...bot, derivedPresetId: requirePresetId(presetId) });
}

/** Which Bot owns a Session, and the segment it is. */
export function segmentOwner(
  registry: BotRegistry,
  sessionId: string,
): { bot: Bot; segment: Segment } | null {
  for (const bot of registry.bots) {
    const segment = bot.segments.find((item) => item.sessionId === sessionId);
    if (segment !== undefined) return { bot, segment };
  }
  return null;
}

/** Preset id a later dsh Agent create or resume should use for this Bot. */
export function presetForBot(registry: BotRegistry, botId: string): string {
  const bot = mustBot(registry, botId);
  const derived = blankToNull(bot.derivedPresetId);
  if (derived !== null) return derived;
  const bound = blankToNull(bot.boundPresetId);
  if (bound !== null) return bound;
  const template = registry.templates.find((item) => item.id === bot.templateId);
  if (template === undefined) throw invalid(`Bot ${botId} 的模板 ${bot.templateId} 不存在。`);
  return template.presetId;
}

export function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function replaceBot(registry: BotRegistry, bot: Bot): BotRegistry {
  return { ...registry, bots: registry.bots.map((item) => (item.id === bot.id ? bot : item)) };
}

function mapSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  change: (segment: Segment) => Segment,
): BotRegistry {
  const bot = mustBot(registry, botId);
  if (!bot.segments.some((segment) => segment.sessionId === sessionId)) {
    throw invalid(`Bot ${botId} 没有 Session ${sessionId} 的段。`);
  }
  return replaceBot(registry, {
    ...bot,
    segments: bot.segments.map((segment) =>
      segment.sessionId === sessionId ? change(segment) : segment,
    ),
  });
}

function mustBot(registry: BotRegistry, botId: string): Bot {
  const bot = registry.bots.find((item) => item.id === botId);
  if (bot === undefined) throw notFound("bot", botId);
  return bot;
}

/** Main Bot rejects every write that would remove it from the product. */
function writableBot(registry: BotRegistry, botId: string): Bot {
  if (botId === MAIN_BOT_ID) {
    throw new RemoteError("bots/main-bot", "Main Bot 不能归档或删除。", { botId });
  }
  return mustBot(registry, botId);
}

function mustTemplate(registry: BotRegistry, id: string): BotTemplate {
  const template = registry.templates.find((item) => item.id === id);
  if (template === undefined) throw notFound("template", id);
  return template;
}

function requireTemplate(registry: BotRegistry, id: string): BotTemplate {
  const trimmed = id.trim();
  if (!trimmed) throw invalid("模板 id 不能为空。");
  return mustTemplate(registry, trimmed);
}

function requireName(value: string): string {
  const name = value.trim();
  if (!name) throw invalid("名称不能为空。");
  return name;
}

function requirePresetId(value: string): string {
  const presetId = value.trim();
  if (!presetId) throw invalid("Agent preset id 不能为空。");
  return presetId;
}

function notFound(kind: "bot" | "template", id: string): RemoteError<"bots/not-found"> {
  return new RemoteError("bots/not-found", `${kind} ${id} 不存在。`, { kind, id });
}

function invalid(reason: string): RemoteError<"bots/invalid"> {
  return new RemoteError("bots/invalid", reason, { reason });
}
