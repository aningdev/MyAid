/** Desktop registry: a Bot is an instance of a product template, and the template maps to a DSH Agent preset id. */

export const REGISTRY_VERSION = 2 as const;

export type BotTemplate = {
  id: string;
  name: string;
  /** DSH Agent preset id. Not a snapshot of the preset body. */
  presetId: string;
};

export type BotStatus = "draft" | "ready";

/** A Harness Session owned by one Bot. The event log stays in dsh. */
export type SessionClaim = {
  sessionId: string;
  title: string | null;
  archived: boolean;
};

export type Bot = {
  id: string;
  name: string;
  templateId: string;
  workspace: string;
  defaultModel: string | null;
  claims: SessionClaim[];
  /** Stays true after a missing session is released, so the Bot cannot be deleted. */
  hadSession: boolean;
  status: BotStatus;
  /** Preset id captured from the template at initialization. */
  boundPresetId: string | null;
  /** Set when this Bot's capabilities diverge. The plugin owns the preset body. */
  derivedPresetId: string | null;
};

export type BotRegistry = {
  version: typeof REGISTRY_VERSION;
  templates: BotTemplate[];
  bots: Bot[];
};

export type RegistryIssue =
  | { code: "corrupt" }
  | { code: "invalid"; reason: string }
  | { code: "not-found"; kind: "template" | "bot"; id: string }
  | { code: "missing-template"; templateId: string }
  | { code: "template-in-use"; templateId: string }
  | { code: "not-draft"; botId: string }
  | { code: "empty-workspace"; botId: string }
  | { code: "frozen"; botId: string; field: "templateId" | "workspace" }
  | { code: "empty-name" }
  | { code: "empty-preset" }
  | { code: "duplicate-id"; id: string }
  | { code: "not-ready"; botId: string }
  | { code: "session-claimed"; sessionId: string }
  | { code: "bot-has-sessions"; botId: string }
  | { code: "claim-not-found"; sessionId: string };

export class RegistryRejection extends Error {
  readonly issue: RegistryIssue;

  constructor(issue: RegistryIssue) {
    super(rejectionMessage(issue));
    this.name = "RegistryRejection";
    this.issue = issue;
  }
}

export type ParseResult = { ok: true; registry: BotRegistry } | { ok: false; message: string };

export type PresetBindingLabel = "跟随模板" | "已绑定" | "单独配置";

export function emptyRegistry(): BotRegistry {
  return { version: REGISTRY_VERSION, templates: [], bots: [] };
}

export function newId(): string {
  return crypto.randomUUID();
}

export function rejectionMessage(issue: RegistryIssue): string {
  switch (issue.code) {
    case "corrupt":
      return "注册表已损坏，未覆盖文件。";
    case "invalid":
      return issue.reason;
    case "not-found":
      return "找不到这条记录。";
    case "missing-template":
      return "模板不在了。";
    case "template-in-use":
      return "仍有 Bot 使用此模板。";
    case "not-draft":
      return "这个 Bot 已经初始化。";
    case "empty-workspace":
      return "初始化前要填写工作区。";
    case "frozen":
      return issue.field === "templateId" ? "初始化后不能改模板。" : "初始化后不能改工作区。";
    case "empty-name":
      return "名称不能为空。";
    case "empty-preset":
      return "Agent preset id 不能为空。";
    case "duplicate-id":
      return "标识已存在。";
    case "not-ready":
      return "初始化之后才能新建会话。";
    case "session-claimed":
      return "这条会话已经属于一个 Bot。";
    case "bot-has-sessions":
      return "这个 Bot 已经有过会话。";
    case "claim-not-found":
      return "找不到这条会话。";
  }
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
    templateId: string;
    workspace?: string;
    defaultModel?: string | null;
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
    templateId: template.id,
    workspace: input.workspace?.trim() ?? "",
    defaultModel: blankToNull(input.defaultModel ?? null),
    claims: [],
    hadSession: false,
    status: "draft",
    boundPresetId: null,
    derivedPresetId: null,
  };
  return { ...registry, bots: [...registry.bots, bot] };
}

export function updateBot(
  registry: BotRegistry,
  id: string,
  patch: {
    name?: string;
    templateId?: string;
    workspace?: string;
    defaultModel?: string | null;
  },
): BotRegistry {
  const bot = mustBot(registry, id);
  let templateId = bot.templateId;
  if (patch.templateId !== undefined && patch.templateId !== bot.templateId) {
    if (bot.status === "ready") {
      throw new RegistryRejection({ code: "frozen", botId: id, field: "templateId" });
    }
    templateId = requireTemplate(registry, patch.templateId).id;
  }
  let workspace = bot.workspace;
  if (patch.workspace !== undefined && patch.workspace.trim() !== bot.workspace) {
    if (bot.status === "ready") {
      throw new RegistryRejection({ code: "frozen", botId: id, field: "workspace" });
    }
    workspace = patch.workspace.trim();
  }
  const next: Bot = {
    ...bot,
    name: patch.name === undefined ? bot.name : requireName(patch.name),
    templateId,
    workspace,
    defaultModel:
      patch.defaultModel === undefined ? bot.defaultModel : blankToNull(patch.defaultModel),
  };
  return replaceBot(registry, next);
}

/** Bind the template's preset id. Does not contact dsh and does not allocate a derived preset. */
export function initializeBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.status !== "draft") throw new RegistryRejection({ code: "not-draft", botId });
  const template = templateById(registry, bot.templateId);
  if (!template)
    throw new RegistryRejection({ code: "missing-template", templateId: bot.templateId });
  const workspace = bot.workspace.trim();
  if (!workspace) throw new RegistryRejection({ code: "empty-workspace", botId });
  return replaceBot(registry, {
    ...bot,
    workspace,
    status: "ready",
    boundPresetId: template.presetId,
  });
}

/** Claim a new Harness Session for a ready Bot. */
export function claimSession(registry: BotRegistry, botId: string, sessionId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.status !== "ready") throw new RegistryRejection({ code: "not-ready", botId });
  const id = sessionId.trim();
  if (!id) throw new RegistryRejection({ code: "invalid", reason: "Session id 不能为空。" });
  if (claimOwner(registry, id))
    throw new RegistryRejection({ code: "session-claimed", sessionId: id });
  return replaceBot(registry, {
    ...bot,
    hadSession: true,
    claims: [...bot.claims, { sessionId: id, title: null, archived: false }],
  });
}

export function renameClaim(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  title: string | null,
): BotRegistry {
  return mapClaim(registry, botId, sessionId, (claim) => ({
    ...claim,
    title: blankToNull(title),
  }));
}

/** Mark the claim archived. Caller must refuse this while that session is executing. */
export function archiveClaim(registry: BotRegistry, botId: string, sessionId: string): BotRegistry {
  return mapClaim(registry, botId, sessionId, (claim) => ({ ...claim, archived: true }));
}

/**
 * Drop a claim whose Harness Session is already gone.
 * `hadSession` stays set. Caller must not use this while dsh still has the session.
 */
export function releaseClaim(registry: BotRegistry, botId: string, sessionId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  if (!bot.claims.some((claim) => claim.sessionId === sessionId)) {
    throw new RegistryRejection({ code: "claim-not-found", sessionId });
  }
  return replaceBot(registry, {
    ...bot,
    claims: bot.claims.filter((claim) => claim.sessionId !== sessionId),
  });
}

/** Delete a Bot that has never claimed a session. */
export function deleteBot(registry: BotRegistry, botId: string): BotRegistry {
  const bot = mustBot(registry, botId);
  if (bot.hadSession || bot.claims.length > 0) {
    throw new RegistryRejection({ code: "bot-has-sessions", botId });
  }
  return { ...registry, bots: registry.bots.filter((item) => item.id !== botId) };
}

export function claimOwner(
  registry: BotRegistry,
  sessionId: string,
): { bot: Bot; claim: SessionClaim } | null {
  for (const bot of registry.bots) {
    const claim = bot.claims.find((item) => item.sessionId === sessionId);
    if (claim) return { bot, claim };
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

export function serializeRegistry(registry: BotRegistry): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

export function parseRegistry(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, message: "注册表不是 JSON。" };
  }
  if (!isRecord(value) || (value.version !== 1 && value.version !== REGISTRY_VERSION)) {
    return { ok: false, message: "注册表版本无法读取。" };
  }
  const legacy = value.version === 1;
  if (!Array.isArray(value.templates) || !Array.isArray(value.bots)) {
    return { ok: false, message: "注册表缺少模板或 Bot 列表。" };
  }
  const templates: BotTemplate[] = [];
  const templateIds = new Set<string>();
  for (const item of value.templates) {
    const parsed = parseTemplate(item);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    if (templateIds.has(parsed.id)) return { ok: false, message: "模板 id 重复。" };
    templateIds.add(parsed.id);
    templates.push(parsed);
  }
  const bots: Bot[] = [];
  const botIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const item of value.bots) {
    const parsed = parseBot(item, legacy);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    if (botIds.has(parsed.id)) return { ok: false, message: "Bot id 重复。" };
    if (!templateIds.has(parsed.templateId)) {
      return { ok: false, message: "Bot 引用了不存在的模板。" };
    }
    for (const claim of parsed.claims) {
      if (sessionIds.has(claim.sessionId)) return { ok: false, message: "Session id 重复。" };
      sessionIds.add(claim.sessionId);
    }
    botIds.add(parsed.id);
    bots.push(parsed);
  }
  return { ok: true, registry: { version: REGISTRY_VERSION, templates, bots } };
}

function parseTemplate(value: unknown): BotTemplate | string {
  if (!isRecord(value)) return "模板项无效。";
  const id = readRequiredString(value, "id");
  const name = readRequiredString(value, "name");
  const presetId = readRequiredString(value, "presetId");
  if (!id || !name || !presetId) return "模板项无效。";
  if (!name.trim() || !presetId.trim()) return "模板项无效。";
  return { id, name: name.trim(), presetId: presetId.trim() };
}

function parseBot(value: unknown, legacy: boolean): Bot | string {
  if (!isRecord(value)) return "Bot 项无效。";
  const id = readRequiredString(value, "id");
  const name = readRequiredString(value, "name");
  const templateId = readRequiredString(value, "templateId");
  const workspace = readRequiredString(value, "workspace");
  const status = value.status;
  const defaultModel = readNullableString(value, "defaultModel");
  const boundPresetId = readNullableString(value, "boundPresetId");
  const derivedPresetId = readNullableString(value, "derivedPresetId");
  if (!id || !name?.trim() || !templateId || workspace === undefined) return "Bot 项无效。";
  if (status !== "draft" && status !== "ready") return "Bot 项无效。";
  if (defaultModel === undefined || boundPresetId === undefined || derivedPresetId === undefined) {
    return "Bot 项无效。";
  }
  if (status === "ready" && !blankToNull(boundPresetId) && !blankToNull(derivedPresetId)) {
    return "Bot 项无效。";
  }
  const claims = legacy ? legacyClaims(value) : parseClaims(value.claims);
  if (typeof claims === "string") return claims;
  const hadSession = legacy ? claims.length > 0 : value.hadSession;
  if (typeof hadSession !== "boolean") return "Bot 项无效。";
  if (claims.length > 0 && !hadSession) return "Bot 项无效。";
  return {
    id,
    name: name.trim(),
    templateId,
    workspace,
    defaultModel: blankToNull(defaultModel),
    claims,
    hadSession,
    status,
    boundPresetId: blankToNull(boundPresetId),
    derivedPresetId: blankToNull(derivedPresetId),
  };
}

function legacyClaims(value: Record<string, unknown>): SessionClaim[] | string {
  const sessionId = readNullableString(value, "sessionId");
  if (sessionId === undefined) return "Bot 项无效。";
  const id = blankToNull(sessionId);
  if (!id) return [];
  return [{ sessionId: id, title: null, archived: false }];
}

function parseClaims(value: unknown): SessionClaim[] | string {
  if (!Array.isArray(value)) return "Bot 项无效。";
  const claims: SessionClaim[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return "Bot 项无效。";
    const sessionId = readRequiredString(item, "sessionId")?.trim();
    const title = readNullableString(item, "title");
    if (!sessionId || title === undefined || typeof item.archived !== "boolean")
      return "Bot 项无效。";
    if (seen.has(sessionId)) return "Bot 项无效。";
    seen.add(sessionId);
    claims.push({ sessionId, title: blankToNull(title), archived: item.archived });
  }
  return claims;
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

function mapClaim(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  change: (claim: SessionClaim) => SessionClaim,
): BotRegistry {
  const bot = mustBot(registry, botId);
  if (!bot.claims.some((claim) => claim.sessionId === sessionId)) {
    throw new RegistryRejection({ code: "claim-not-found", sessionId });
  }
  return replaceBot(registry, {
    ...bot,
    claims: bot.claims.map((claim) => (claim.sessionId === sessionId ? change(claim) : claim)),
  });
}

function replaceBot(registry: BotRegistry, bot: Bot): BotRegistry {
  return { ...registry, bots: registry.bots.map((item) => (item.id === bot.id ? bot : item)) };
}

function blankToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readRequiredString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
