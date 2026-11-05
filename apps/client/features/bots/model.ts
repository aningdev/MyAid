/** Desktop registry: a Bot is an instance of a product template, and the template maps to a DSH Agent preset id. */

export const REGISTRY_VERSION = 1 as const;

export type BotTemplate = {
  id: string;
  name: string;
  /** DSH Agent preset id. Not a snapshot of the preset body. */
  presetId: string;
};

export type BotStatus = "draft" | "ready";

export type Bot = {
  id: string;
  name: string;
  templateId: string;
  workspace: string;
  defaultModel: string | null;
  sessionId: string | null;
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
  | { code: "duplicate-id"; id: string };

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
    sessionId: null,
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
  if (!isRecord(value) || value.version !== REGISTRY_VERSION) {
    return { ok: false, message: "注册表版本不是 1。" };
  }
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

function parseBot(value: unknown): Bot | string {
  if (!isRecord(value)) return "Bot 项无效。";
  const id = readRequiredString(value, "id");
  const name = readRequiredString(value, "name");
  const templateId = readRequiredString(value, "templateId");
  const workspace = readRequiredString(value, "workspace");
  const status = value.status;
  const defaultModel = readNullableString(value, "defaultModel");
  const sessionId = readNullableString(value, "sessionId");
  const boundPresetId = readNullableString(value, "boundPresetId");
  const derivedPresetId = readNullableString(value, "derivedPresetId");
  if (!id || !name?.trim() || !templateId || workspace === undefined) return "Bot 项无效。";
  if (status !== "draft" && status !== "ready") return "Bot 项无效。";
  if (
    defaultModel === undefined ||
    sessionId === undefined ||
    boundPresetId === undefined ||
    derivedPresetId === undefined
  ) {
    return "Bot 项无效。";
  }
  if (status === "ready" && !blankToNull(boundPresetId) && !blankToNull(derivedPresetId)) {
    return "Bot 项无效。";
  }
  return {
    id,
    name: name.trim(),
    templateId,
    workspace,
    defaultModel: blankToNull(defaultModel),
    sessionId: blankToNull(sessionId),
    status,
    boundPresetId: blankToNull(boundPresetId),
    derivedPresetId: blankToNull(derivedPresetId),
  };
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
