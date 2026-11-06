/** Desktop registry: Bot → Dialogue → Session (claim). Bot capability = Agent preset. */

export const REGISTRY_VERSION = 3 as const;

export type BotTemplate = {
  id: string;
  name: string;
  /** DSH Agent preset id. Not a snapshot of the preset body. */
  presetId: string;
};

export type BotStatus = "draft" | "ready";

/** A Harness Session claimed to one Dialogue. The event log stays in dsh. */
export type SessionClaim = {
  sessionId: string;
  title: string | null;
};

export type Bot = {
  id: string;
  name: string;
  templateId: string;
  defaultModel: string | null;
  /** Stays true after any Dialogue existed, so the Bot cannot be deleted. */
  hadDialogue: boolean;
  status: BotStatus;
  /** Preset id captured from the template at initialization. */
  boundPresetId: string | null;
  /** Set when this Bot's capabilities diverge. The plugin owns the preset body. */
  derivedPresetId: string | null;
};

/** Long-running thread with a Bot; binds one workspace path. */
export type Dialogue = {
  id: string;
  botId: string;
  workspacePath: string;
  archived: boolean;
  claims: SessionClaim[];
};

export type BotRegistry = {
  version: typeof REGISTRY_VERSION;
  templates: BotTemplate[];
  bots: Bot[];
  dialogues: Dialogue[];
};

export type RegistryIssue =
  | { code: "corrupt" }
  | { code: "invalid"; reason: string }
  | { code: "unsupported-version"; version: unknown }
  | { code: "not-found"; kind: "template" | "bot" | "dialogue"; id: string }
  | { code: "missing-template"; templateId: string }
  | { code: "template-in-use"; templateId: string }
  | { code: "not-draft"; botId: string }
  | { code: "empty-workspace"; dialogueId?: string }
  | { code: "frozen"; kind: "bot" | "dialogue"; id: string; field: "templateId" | "workspacePath" }
  | { code: "empty-name" }
  | { code: "empty-preset" }
  | { code: "duplicate-id"; id: string }
  | { code: "not-ready"; botId: string }
  | { code: "dialogue-archived"; dialogueId: string }
  | { code: "session-claimed"; sessionId: string }
  | { code: "bot-has-dialogues"; botId: string }
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
  return { version: REGISTRY_VERSION, templates: [], bots: [], dialogues: [] };
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
    case "unsupported-version":
      return "注册表版本过旧或无法读取，请删除 ~/.myaid/registry/bots.json 后重建。";
    case "not-found":
      return "找不到这条记录。";
    case "missing-template":
      return "模板不在了。";
    case "template-in-use":
      return "仍有 Bot 使用此模板。";
    case "not-draft":
      return "这个 Bot 已经初始化。";
    case "empty-workspace":
      return "创建 Dialogue 前要填写工作区路径。";
    case "frozen":
      return issue.field === "templateId"
        ? "初始化后不能改模板。"
        : "创建后不能改 Dialogue 工作区。";
    case "empty-name":
      return "名称不能为空。";
    case "empty-preset":
      return "Agent preset id 不能为空。";
    case "duplicate-id":
      return "标识已存在。";
    case "not-ready":
      return "初始化之后才能新建 Dialogue。";
    case "dialogue-archived":
      return "这段 Dialogue 已归档。";
    case "session-claimed":
      return "这条会话已经认领到一段 Dialogue。";
    case "bot-has-dialogues":
      return "这个 Bot 已经有过 Dialogue。";
    case "claim-not-found":
      return "找不到这条会话认领。";
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
    defaultModel: blankToNull(input.defaultModel ?? null),
    hadDialogue: false,
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
    defaultModel?: string | null;
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
    templateId,
    defaultModel:
      patch.defaultModel === undefined ? bot.defaultModel : blankToNull(patch.defaultModel),
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

/** Create a Dialogue under a ready Bot. Workspace path is required and frozen afterwards. */
export function createDialogue(
  registry: BotRegistry,
  input: { botId: string; workspacePath: string },
  id: string = newId(),
): BotRegistry {
  const bot = mustBot(registry, input.botId);
  if (bot.status !== "ready") throw new RegistryRejection({ code: "not-ready", botId: bot.id });
  if (registry.dialogues.some((item) => item.id === id)) {
    throw new RegistryRejection({ code: "duplicate-id", id });
  }
  const workspacePath = input.workspacePath.trim();
  if (!workspacePath) throw new RegistryRejection({ code: "empty-workspace" });
  const dialogue: Dialogue = {
    id,
    botId: bot.id,
    workspacePath,
    archived: false,
    claims: [],
  };
  return {
    ...replaceBot(registry, { ...bot, hadDialogue: true }),
    dialogues: [...registry.dialogues, dialogue],
  };
}

export function archiveDialogue(registry: BotRegistry, dialogueId: string): BotRegistry {
  const dialogue = mustDialogue(registry, dialogueId);
  return replaceDialogue(registry, { ...dialogue, archived: true });
}

/** Claim a new Harness Session for an active Dialogue. */
export function claimSession(
  registry: BotRegistry,
  dialogueId: string,
  sessionId: string,
): BotRegistry {
  const dialogue = mustDialogue(registry, dialogueId);
  if (dialogue.archived)
    throw new RegistryRejection({ code: "dialogue-archived", dialogueId: dialogue.id });
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
  if (!isRecord(value)) {
    return { ok: false, message: "注册表不是对象。" };
  }
  if (value.version !== REGISTRY_VERSION) {
    return {
      ok: false,
      message: rejectionMessage({ code: "unsupported-version", version: value.version }),
    };
  }
  if (
    !Array.isArray(value.templates) ||
    !Array.isArray(value.bots) ||
    !Array.isArray(value.dialogues)
  ) {
    return { ok: false, message: "注册表缺少模板、Bot 或 Dialogue 列表。" };
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
  for (const item of value.bots) {
    const parsed = parseBot(item);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    if (botIds.has(parsed.id)) return { ok: false, message: "Bot id 重复。" };
    if (!templateIds.has(parsed.templateId)) {
      return { ok: false, message: "Bot 引用了不存在的模板。" };
    }
    botIds.add(parsed.id);
    bots.push(parsed);
  }
  const dialogues: Dialogue[] = [];
  const dialogueIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const item of value.dialogues) {
    const parsed = parseDialogue(item);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    if (dialogueIds.has(parsed.id)) return { ok: false, message: "Dialogue id 重复。" };
    if (!botIds.has(parsed.botId)) {
      return { ok: false, message: "Dialogue 引用了不存在的 Bot。" };
    }
    for (const claim of parsed.claims) {
      if (sessionIds.has(claim.sessionId)) return { ok: false, message: "Session id 重复。" };
      sessionIds.add(claim.sessionId);
    }
    dialogueIds.add(parsed.id);
    dialogues.push(parsed);
  }
  for (const bot of bots) {
    const hasDialogue = dialogues.some((item) => item.botId === bot.id);
    if (hasDialogue && !bot.hadDialogue) {
      return { ok: false, message: "Bot 项无效：存在 Dialogue 但 hadDialogue 为 false。" };
    }
  }
  return { ok: true, registry: { version: REGISTRY_VERSION, templates, bots, dialogues } };
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

function parseBot(value: unknown): Bot | string {
  if (!isRecord(value)) return "Bot 项无效。";
  const id = readRequiredString(value, "id");
  const name = readRequiredString(value, "name");
  const templateId = readRequiredString(value, "templateId");
  const status = value.status;
  const defaultModel = readNullableString(value, "defaultModel");
  const boundPresetId = readNullableString(value, "boundPresetId");
  const derivedPresetId = readNullableString(value, "derivedPresetId");
  if (!id || !name?.trim() || !templateId) return "Bot 项无效。";
  if (status !== "draft" && status !== "ready") return "Bot 项无效。";
  if (defaultModel === undefined || boundPresetId === undefined || derivedPresetId === undefined) {
    return "Bot 项无效。";
  }
  if (status === "ready" && !blankToNull(boundPresetId) && !blankToNull(derivedPresetId)) {
    return "Bot 项无效。";
  }
  if (typeof value.hadDialogue !== "boolean") return "Bot 项无效。";
  return {
    id,
    name: name.trim(),
    templateId,
    defaultModel: blankToNull(defaultModel),
    hadDialogue: value.hadDialogue,
    status,
    boundPresetId: blankToNull(boundPresetId),
    derivedPresetId: blankToNull(derivedPresetId),
  };
}

function parseDialogue(value: unknown): Dialogue | string {
  if (!isRecord(value)) return "Dialogue 项无效。";
  const id = readRequiredString(value, "id");
  const botId = readRequiredString(value, "botId");
  const workspacePath = readRequiredString(value, "workspacePath");
  if (!id || !botId || workspacePath === undefined) return "Dialogue 项无效。";
  if (!workspacePath.trim()) return "Dialogue 项无效。";
  if (typeof value.archived !== "boolean") return "Dialogue 项无效。";
  const claims = parseClaims(value.claims);
  if (typeof claims === "string") return claims;
  return {
    id,
    botId,
    workspacePath: workspacePath.trim(),
    archived: value.archived,
    claims,
  };
}

function parseClaims(value: unknown): SessionClaim[] | string {
  if (!Array.isArray(value)) return "Dialogue 项无效。";
  const claims: SessionClaim[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return "Dialogue 项无效。";
    const sessionId = readRequiredString(item, "sessionId")?.trim();
    const title = readNullableString(item, "title");
    if (!sessionId || title === undefined) return "Dialogue 项无效。";
    if (seen.has(sessionId)) return "Dialogue 项无效。";
    seen.add(sessionId);
    claims.push({ sessionId, title: blankToNull(title) });
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
