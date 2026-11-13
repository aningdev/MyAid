/**
 * Registry file format: parse (v5, and the v3 / v4 files that still need a
 * Host to migrate) and serialize. The domain model and its mutations live in
 * `model.ts`; this module owns only the bytes.
 */
import { defaultIdentity, readIdentity } from "./identity";
import type { Bot, BotRegistry, BotTemplate, Dialogue, SessionClaim } from "./model";
import {
  blankToNull,
  isRecord,
  readNullableString,
  readOptionalString,
  readRequiredString,
  REGISTRY_VERSION,
  rejectionMessage,
} from "./registry";

/**
 * A v3 / v4 Dialogue: it carries its own path, name and archive flag, which
 * dsh's Workspace must take over before the file can be read as v5.
 */
export type LegacyDialogue = {
  id: string;
  botId: string;
  workspacePath: string;
  /** The person's own name; `null` reads as the workspace's last segment. */
  name: string | null;
  archived: boolean;
  claims: (SessionClaim & { archived: boolean })[];
};

/** A v3 / v4 file: the same Bots, Dialogues that still own their path. */
export type LegacyRegistry = {
  templates: BotTemplate[];
  bots: Bot[];
  dialogues: LegacyDialogue[];
};

export type ParseResult =
  | { ok: true; state: "current"; registry: BotRegistry }
  | { ok: true; state: "legacy"; legacy: LegacyRegistry }
  | { ok: false; message: string };

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
  // v3 / v4 files still own their Dialogue paths: they are read whole and
  // handed to the migration, which writes v5 through `serializeRegistry`.
  const sourceVersion = value.version;
  if (sourceVersion !== 3 && sourceVersion !== 4 && sourceVersion !== REGISTRY_VERSION) {
    return {
      ok: false,
      message: rejectionMessage({ code: "unsupported-version", version: sourceVersion }),
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
    const parsed = parseBot(item, sourceVersion);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    if (botIds.has(parsed.id)) return { ok: false, message: "Bot id 重复。" };
    if (!templateIds.has(parsed.templateId)) {
      return { ok: false, message: "Bot 引用了不存在的模板。" };
    }
    botIds.add(parsed.id);
    bots.push(parsed);
  }
  const legacy = sourceVersion !== REGISTRY_VERSION;
  const dialogues: Dialogue[] = [];
  const legacyDialogues: LegacyDialogue[] = [];
  const dialogueIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const item of value.dialogues) {
    const parsed = legacy ? parseLegacyDialogue(item, sourceVersion as 3 | 4) : parseDialogue(item);
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
    if ("workspacePath" in parsed) legacyDialogues.push(parsed);
    else dialogues.push(parsed);
  }
  const all = legacy ? legacyDialogues : dialogues;
  for (const bot of bots) {
    const hasDialogue = all.some((item) => item.botId === bot.id);
    if (hasDialogue && !bot.hadDialogue) {
      return { ok: false, message: "Bot 项无效：存在 Dialogue 但 hadDialogue 为 false。" };
    }
  }
  if (legacy) {
    return { ok: true, state: "legacy", legacy: { templates, bots, dialogues: legacyDialogues } };
  }
  return {
    ok: true,
    state: "current",
    registry: { version: REGISTRY_VERSION, templates, bots, dialogues },
  };
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

function parseBot(value: unknown, version: number): Bot | string {
  if (!isRecord(value)) return "Bot 项无效。";
  const id = readRequiredString(value, "id");
  const name = readRequiredString(value, "name");
  const templateId = readRequiredString(value, "templateId");
  const status = value.status;
  const defaultModel = readNullableString(value, "defaultModel");
  const boundPresetId = readNullableString(value, "boundPresetId");
  const derivedPresetId = readNullableString(value, "derivedPresetId");
  // Preferences added after v3 shipped: absent in older files, read as null.
  const description = readOptionalString(value, "description");
  const defaultThinking = readOptionalString(value, "defaultThinking");
  const defaultWorkspacePath = readOptionalString(value, "defaultWorkspacePath");
  if (!id || !name?.trim() || !templateId) return "Bot 项无效。";
  if (status !== "draft" && status !== "ready") return "Bot 项无效。";
  if (defaultModel === undefined || boundPresetId === undefined || derivedPresetId === undefined) {
    return "Bot 项无效。";
  }
  if (
    description === undefined ||
    defaultThinking === undefined ||
    defaultWorkspacePath === undefined
  ) {
    return "Bot 项无效。";
  }
  if (status === "ready" && !blankToNull(boundPresetId) && !blankToNull(derivedPresetId)) {
    return "Bot 项无效。";
  }
  if (typeof value.hadDialogue !== "boolean") return "Bot 项无效。";
  return {
    id,
    name: name.trim(),
    // v3 had no identity: derive one from the id, the same on every read.
    identity: version === 3 ? defaultIdentity(id) : readIdentity(value.identity, id),
    description: blankToNull(description),
    templateId,
    defaultModel: blankToNull(defaultModel),
    defaultThinking: blankToNull(defaultThinking),
    defaultWorkspacePath: blankToNull(defaultWorkspacePath),
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
  const workspaceId = readRequiredString(value, "workspaceId");
  if (!id || !botId || !workspaceId?.trim()) return "Dialogue 项无效。";
  const claims = parseClaims(value.claims, REGISTRY_VERSION);
  if (typeof claims === "string") return claims;
  return {
    id,
    botId,
    workspaceId: workspaceId.trim(),
    claims: claims.map(({ sessionId, title }) => ({ sessionId, title })),
  };
}

function parseLegacyDialogue(value: unknown, version: 3 | 4): LegacyDialogue | string {
  if (!isRecord(value)) return "Dialogue 项无效。";
  const id = readRequiredString(value, "id");
  const botId = readRequiredString(value, "botId");
  const workspacePath = readRequiredString(value, "workspacePath");
  if (!id || !botId || workspacePath === undefined) return "Dialogue 项无效。";
  if (!workspacePath.trim()) return "Dialogue 项无效。";
  if (typeof value.archived !== "boolean") return "Dialogue 项无效。";
  // Names shipped after v3: an older file reads its workspace's segment.
  const name = version === 3 ? null : readOptionalString(value, "name");
  if (name === undefined) return "Dialogue 项无效。";
  const claims = parseClaims(value.claims, version);
  if (typeof claims === "string") return claims;
  return {
    id,
    botId,
    workspacePath: workspacePath.trim(),
    name: blankToNull(name),
    archived: value.archived,
    claims: claims.map((claim) => ({
      sessionId: claim.sessionId,
      title: claim.title,
      archived: claim.archived === true,
    })),
  };
}

function parseClaims(
  value: unknown,
  version: number,
): (SessionClaim & { archived?: boolean })[] | string {
  if (!Array.isArray(value)) return "Dialogue 项无效。";
  const claims: (SessionClaim & { archived?: boolean })[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return "Dialogue 项无效。";
    const sessionId = readRequiredString(item, "sessionId")?.trim();
    const title = readNullableString(item, "title");
    if (!sessionId || title === undefined) return "Dialogue 项无效。";
    if (seen.has(sessionId)) return "Dialogue 项无效。";
    seen.add(sessionId);
    // Archived claims shipped after v3, and only a v4 file still carries them.
    const archived = version === 3 ? false : version === 4 ? item.archived : undefined;
    if (version === 4 && typeof archived !== "boolean") return "Dialogue 项无效。";
    claims.push({
      sessionId,
      title: blankToNull(title),
      ...(typeof archived === "boolean" ? { archived } : {}),
    });
  }
  return claims;
}
