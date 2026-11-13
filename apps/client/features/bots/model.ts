/** Desktop registry: Bot → its one long conversation (segments). Bot capability = Agent preset. */

import { defaultIdentity, type BotIdentity } from "./identity";
import { blankToNull, REGISTRY_VERSION, RegistryRejection } from "./registry";

export {
  parseRegistry,
  serializeRegistry,
  type LegacyDialogue,
  type LegacyRegistry,
  type ParseResult,
  type PreviousDialogue,
} from "./format";
export {
  REGISTRY_VERSION,
  RegistryRejection,
  rejectionMessage,
  type RegistryIssue,
} from "./registry";

/**
 * v6: a Bot owns its one long conversation. A **segment** is one dsh Session
 * and the dsh Workspace it ran in; segments of one Bot may span Workspaces.
 * v5 (and the older v3 / v4 files) carry Dialogues instead and migrate once a
 * Host is connected (see `features/workspace/migrate`).
 */

/** Derived presets are Bot-owned; they must not become pickable templates. */
export const DERIVED_PRESET_PREFIX = "myaid-bot-";

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
  /** dsh Workspace id; this segment's path, title and order live there. */
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

export type PresetBindingLabel = "跟随模板" | "已绑定" | "单独配置";

export function emptyRegistry(): BotRegistry {
  return { version: REGISTRY_VERSION, templates: [], bots: [] };
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Drafts follow the template's current preset. Initialized bots keep `boundPresetId` until a derived preset is set. */
export function resolveAgentPreset(bot: Bot, template: BotTemplate | null): string {
  const derived = blankToNull(bot.derivedPresetId);
  if (derived) return derived;
  const bound = blankToNull(bot.boundPresetId);
  if (bound) return bound;
  if (!template || template.id !== bot.templateId) {
    throw new RegistryRejection({ code: "missing-template", templateId: bot.templateId });
  }
  return template.presetId;
}

/** Preset id a later Agent create/resume should pass for this Bot. */
export function presetForBot(registry: BotRegistry, botId: string): string {
  const bot = mustBot(registry, botId);
  return resolveAgentPreset(bot, templateById(registry, bot.templateId));
}

export function presetBinding(
  bot: Bot,
  template: BotTemplate | null,
): { presetId: string; label: PresetBindingLabel } {
  const presetId = resolveAgentPreset(bot, template);
  if (blankToNull(bot.derivedPresetId)) return { presetId, label: "单独配置" };
  if (blankToNull(bot.boundPresetId)) return { presetId, label: "已绑定" };
  return { presetId, label: "跟随模板" };
}

export function createTemplate(
  registry: BotRegistry,
  input: { name: string; presetId: string },
  id: string = newId(),
): BotRegistry {
  const template = readTemplateInput(id, input.name, input.presetId);
  if (registry.templates.some((item) => item.id === template.id)) {
    throw new RegistryRejection({ code: "duplicate-id", id: template.id });
  }
  return { ...registry, templates: [...registry.templates, template] };
}

/**
 * Upsert product templates from dsh agent presets.
 * Uses the preset id as the template id. Skips broken presets. Leaves unknown local templates alone.
 */
export function importTemplatesFromPresets(
  registry: BotRegistry,
  presets: { id: string; name: string; broken?: string }[],
): BotRegistry {
  let next = registry;
  for (const preset of presets) {
    if (preset.broken) continue;
    const id = preset.id.trim();
    const name = preset.name.trim() || id;
    if (!id) continue;
    const existing = next.templates.find((item) => item.id === id);
    if (!existing) {
      next = createTemplate(next, { name, presetId: id }, id);
      continue;
    }
    if (existing.name === name && existing.presetId === id) continue;
    next = updateTemplate(next, id, { name, presetId: id });
  }
  return next;
}

export function updateTemplate(
  registry: BotRegistry,
  id: string,
  patch: { name?: string; presetId?: string },
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
    throw new RegistryRejection({ code: "template-in-use", templateId: id });
  }
  return { ...registry, templates: registry.templates.filter((item) => item.id !== id) };
}

export function createBot(
  registry: BotRegistry,
  input: {
    name: string;
    description?: string | null;
    templateId: string;
    defaultModel?: string | null;
    defaultThinking?: string | null;
    defaultWorkspacePath?: string | null;
    identity?: BotIdentity;
  },
  id: string = newId(),
): BotRegistry {
  if (registry.bots.some((bot) => bot.id === id)) {
    throw new RegistryRejection({ code: "duplicate-id", id });
  }
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

export function updateBot(
  registry: BotRegistry,
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    templateId?: string;
    defaultModel?: string | null;
    defaultThinking?: string | null;
    defaultWorkspacePath?: string | null;
    identity?: BotIdentity;
  },
): BotRegistry {
  const bot = mustBot(registry, id);
  let templateId = bot.templateId;
  if (patch.templateId !== undefined && patch.templateId !== bot.templateId) {
    if (bot.status === "ready") {
      throw new RegistryRejection({
        code: "frozen",
        kind: "bot",
        id,
        field: "templateId",
      });
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

/** Bind the template's preset id. Does not contact dsh and does not require a workspace. */
export function initializeBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.status !== "draft") throw new RegistryRejection({ code: "not-draft", botId });
  const template = templateById(registry, bot.templateId);
  if (!template)
    throw new RegistryRejection({ code: "missing-template", templateId: bot.templateId });
  return replaceBot(registry, {
    ...bot,
    status: "ready",
    boundPresetId: template.presetId,
  });
}

/** The Bot's segments, oldest first; the last one is the segment that accepts prompts. */
export function segmentsForBot(registry: BotRegistry, botId: string): Segment[] {
  return mustBot(registry, botId).segments;
}

/**
 * Claim a new Harness Session as the next segment of a Bot's long
 * conversation. Its Workspace is the directory dsh created it in.
 */
export function claimSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  workspaceId: string,
): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.status !== "ready") throw new RegistryRejection({ code: "not-ready", botId });
  const id = sessionId.trim();
  if (!id) throw new RegistryRejection({ code: "invalid", reason: "Session id 不能为空。" });
  const workspace = workspaceId.trim();
  if (!workspace) throw new RegistryRejection({ code: "empty-workspace" });
  if (segmentOwner(registry, id))
    throw new RegistryRejection({ code: "session-claimed", sessionId: id });
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

/**
 * Drop a segment whose Harness Session is already gone.
 * `hadDialogue` on the Bot stays set. Caller must not use this while dsh still has the session.
 */
export function releaseSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
): BotRegistry {
  const bot = mustBot(registry, botId);
  if (!bot.segments.some((segment) => segment.sessionId === sessionId)) {
    throw new RegistryRejection({ code: "segment-not-found", sessionId });
  }
  return replaceBot(registry, {
    ...bot,
    segments: bot.segments.filter((segment) => segment.sessionId !== sessionId),
  });
}

/** Archive a Bot: it leaves the list, its conversation stays. */
export function archiveBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  return bot.archived ? registry : replaceBot(registry, { ...bot, archived: true });
}

/** Bring an archived Bot back into the list. */
export function unarchiveBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  return bot.archived ? replaceBot(registry, { ...bot, archived: false }) : registry;
}

/** Delete a Bot that never had a segment. */
export function deleteBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.hadDialogue || bot.segments.length > 0) {
    throw new RegistryRejection({ code: "bot-has-dialogues", botId });
  }
  return { ...registry, bots: registry.bots.filter((item) => item.id !== botId) };
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

/** Record a per-bot preset id. The caller has registered that preset on the plugin side. */
export function assignDerivedPreset(
  registry: BotRegistry,
  botId: string,
  presetId: string,
): BotRegistry {
  const bot = mustBot(registry, botId);
  return replaceBot(registry, { ...bot, derivedPresetId: requirePresetId(presetId) });
}

function readTemplateInput(id: string, name: string, presetId: string): BotTemplate {
  const trimmedId = id.trim();
  if (!trimmedId) throw new RegistryRejection({ code: "invalid", reason: "模板 id 不能为空。" });
  return { id: trimmedId, name: requireName(name), presetId: requirePresetId(presetId) };
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new RegistryRejection({ code: "empty-name" });
  return trimmed;
}

function requirePresetId(presetId: string): string {
  const trimmed = presetId.trim();
  if (!trimmed) throw new RegistryRejection({ code: "empty-preset" });
  return trimmed;
}

function requireTemplate(registry: BotRegistry, id: string): BotTemplate {
  const template = templateById(registry, id);
  if (!template) throw new RegistryRejection({ code: "missing-template", templateId: id });
  return template;
}

function mustTemplate(registry: BotRegistry, id: string): BotTemplate {
  const template = templateById(registry, id);
  if (!template) throw new RegistryRejection({ code: "not-found", kind: "template", id });
  return template;
}

function mustBot(registry: BotRegistry, id: string): Bot {
  const bot = registry.bots.find((item) => item.id === id);
  if (!bot) throw new RegistryRejection({ code: "not-found", kind: "bot", id });
  return bot;
}

function templateById(registry: BotRegistry, id: string): BotTemplate | null {
  return registry.templates.find((item) => item.id === id) ?? null;
}

function mapSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  change: (segment: Segment) => Segment,
): BotRegistry {
  const bot = mustBot(registry, botId);
  if (!bot.segments.some((segment) => segment.sessionId === sessionId)) {
    throw new RegistryRejection({ code: "segment-not-found", sessionId });
  }
  return replaceBot(registry, {
    ...bot,
    segments: bot.segments.map((segment) =>
      segment.sessionId === sessionId ? change(segment) : segment,
    ),
  });
}

function replaceBot(registry: BotRegistry, bot: Bot): BotRegistry {
  return { ...registry, bots: registry.bots.map((item) => (item.id === bot.id ? bot : item)) };
}
