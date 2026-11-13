/** Desktop registry: Bot → Dialogue → Session (claim). Bot capability = Agent preset. */

import { defaultIdentity, type BotIdentity } from "./identity";
import { blankToNull, REGISTRY_VERSION, RegistryRejection } from "./registry";

export {
  parseRegistry,
  serializeRegistry,
  type LegacyDialogue,
  type LegacyRegistry,
  type ParseResult,
} from "./format";
export {
  REGISTRY_VERSION,
  RegistryRejection,
  rejectionMessage,
  type RegistryIssue,
} from "./registry";

/**
 * v5: a Dialogue names a dsh Workspace instead of a path of its own. The
 * Workspace owns path, title, Session order, pins and the archive set; v3 / v4
 * files migrate once a Host is connected (see `features/workspace/migrate`).
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
 * A Harness Session claimed to one Dialogue. The event log, its archive flag
 * and its pin stay in dsh; `title` is the person's own label, because dsh's
 * Session listing carries no title.
 */
export type SessionClaim = {
  sessionId: string;
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
  /** Workspace path offered when this Bot starts its next Dialogue. */
  defaultWorkspacePath: string | null;
  /** Stays true after any Dialogue existed, so the Bot cannot be deleted. */
  hadDialogue: boolean;
  status: BotStatus;
  /** Preset id captured from the template at initialization. */
  boundPresetId: string | null;
  /** Set when this Bot's capabilities diverge. The plugin owns the preset body. */
  derivedPresetId: string | null;
  /** The mark shown in the Navigator, the chat and the Inspector. */
  identity: BotIdentity;
};

/**
 * A Bot's view of one dsh Workspace: the same directory seen by two Bots is
 * two Dialogues over one Workspace (shared order, pins and archive).
 */
export type Dialogue = {
  id: string;
  botId: string;
  /** dsh Workspace id; path, title, Session order, pins and archive live there. */
  workspaceId: string;
  claims: SessionClaim[];
};

export type BotRegistry = {
  version: typeof REGISTRY_VERSION;
  templates: BotTemplate[];
  bots: Bot[];
  dialogues: Dialogue[];
};

export type PresetBindingLabel = "跟随模板" | "已绑定" | "单独配置";

export function emptyRegistry(): BotRegistry {
  return { version: REGISTRY_VERSION, templates: [], bots: [], dialogues: [] };
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
    identity: input.identity ?? defaultIdentity(id),
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

/** Create a Dialogue under a ready Bot over an existing dsh Workspace. */
export function createDialogue(
  registry: BotRegistry,
  input: { botId: string; workspaceId: string },
  id: string = newId(),
): BotRegistry {
  const bot = mustBot(registry, input.botId);
  if (bot.status !== "ready") throw new RegistryRejection({ code: "not-ready", botId: bot.id });
  if (registry.dialogues.some((item) => item.id === id)) {
    throw new RegistryRejection({ code: "duplicate-id", id });
  }
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) throw new RegistryRejection({ code: "empty-workspace" });
  const dialogue: Dialogue = { id, botId: bot.id, workspaceId, claims: [] };
  return {
    ...replaceBot(registry, { ...bot, hadDialogue: true }),
    dialogues: [...registry.dialogues, dialogue],
  };
}

/** The Dialogue under `botId` that shows `workspaceId`, if this Bot already has one. */
export function dialogueOfWorkspace(
  registry: BotRegistry,
  botId: string,
  workspaceId: string,
): Dialogue | null {
  return (
    registry.dialogues.find((item) => item.botId === botId && item.workspaceId === workspaceId) ??
    null
  );
}

/**
 * Drop a Dialogue that never claimed a Session. The dsh Workspace stays: its
 * directory, its other Dialogues and its Sessions are dsh's, not this file's.
 */
export function removeDialogue(registry: BotRegistry, dialogueId: string): BotRegistry {
  const dialogue = mustDialogue(registry, dialogueId);
  if (dialogue.claims.length > 0) {
    throw new RegistryRejection({ code: "dialogue-has-sessions", dialogueId });
  }
  return {
    ...registry,
    dialogues: registry.dialogues.filter((item) => item.id !== dialogue.id),
  };
}

/** Claim a new Harness Session for a Dialogue. */
export function claimSession(
  registry: BotRegistry,
  dialogueId: string,
  sessionId: string,
): BotRegistry {
  const dialogue = mustDialogue(registry, dialogueId);
  const bot = mustBot(registry, dialogue.botId);
  if (bot.status !== "ready") throw new RegistryRejection({ code: "not-ready", botId: bot.id });
  const id = sessionId.trim();
  if (!id) throw new RegistryRejection({ code: "invalid", reason: "Session id 不能为空。" });
  if (claimOwner(registry, id))
    throw new RegistryRejection({ code: "session-claimed", sessionId: id });
  return replaceDialogue(registry, {
    ...dialogue,
    claims: [...dialogue.claims, { sessionId: id, title: null }],
  });
}

export function renameClaim(
  registry: BotRegistry,
  dialogueId: string,
  sessionId: string,
  title: string | null,
): BotRegistry {
  return mapClaim(registry, dialogueId, sessionId, (claim) => ({
    ...claim,
    title: blankToNull(title),
  }));
}

/**
 * Drop a claim whose Harness Session is already gone.
 * `hadDialogue` on the Bot stays set. Caller must not use this while dsh still has the session.
 */
export function releaseClaim(
  registry: BotRegistry,
  dialogueId: string,
  sessionId: string,
): BotRegistry {
  const dialogue = mustDialogue(registry, dialogueId);
  if (!dialogue.claims.some((claim) => claim.sessionId === sessionId)) {
    throw new RegistryRejection({ code: "claim-not-found", sessionId });
  }
  return replaceDialogue(registry, {
    ...dialogue,
    claims: dialogue.claims.filter((claim) => claim.sessionId !== sessionId),
  });
}

/** Delete a Bot that has never had a Dialogue. */
export function deleteBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.hadDialogue || registry.dialogues.some((item) => item.botId === botId)) {
    throw new RegistryRejection({ code: "bot-has-dialogues", botId });
  }
  return { ...registry, bots: registry.bots.filter((item) => item.id !== botId) };
}

export function claimOwner(
  registry: BotRegistry,
  sessionId: string,
): { bot: Bot; dialogue: Dialogue; claim: SessionClaim } | null {
  for (const dialogue of registry.dialogues) {
    const claim = dialogue.claims.find((item) => item.sessionId === sessionId);
    if (!claim) continue;
    const bot = registry.bots.find((item) => item.id === dialogue.botId);
    if (!bot) continue;
    return { bot, dialogue, claim };
  }
  return null;
}

export function dialoguesForBot(registry: BotRegistry, botId: string): Dialogue[] {
  return registry.dialogues.filter((item) => item.botId === botId);
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

function mustDialogue(registry: BotRegistry, id: string): Dialogue {
  const dialogue = registry.dialogues.find((item) => item.id === id);
  if (!dialogue) throw new RegistryRejection({ code: "not-found", kind: "dialogue", id });
  return dialogue;
}

function templateById(registry: BotRegistry, id: string): BotTemplate | null {
  return registry.templates.find((item) => item.id === id) ?? null;
}

function mapClaim(
  registry: BotRegistry,
  dialogueId: string,
  sessionId: string,
  change: (claim: SessionClaim) => SessionClaim,
): BotRegistry {
  const dialogue = mustDialogue(registry, dialogueId);
  if (!dialogue.claims.some((claim) => claim.sessionId === sessionId)) {
    throw new RegistryRejection({ code: "claim-not-found", sessionId });
  }
  return replaceDialogue(registry, {
    ...dialogue,
    claims: dialogue.claims.map((claim) => (claim.sessionId === sessionId ? change(claim) : claim)),
  });
}

function replaceBot(registry: BotRegistry, bot: Bot): BotRegistry {
  return { ...registry, bots: registry.bots.map((item) => (item.id === bot.id ? bot : item)) };
}

function replaceDialogue(registry: BotRegistry, dialogue: Dialogue): BotRegistry {
  return {
    ...registry,
    dialogues: registry.dialogues.map((item) => (item.id === dialogue.id ? dialogue : item)),
  };
}
