/**
 * Registry file format: parse (with v3 migration) and serialize. The domain
 * model and its mutations live in `model.ts`; this module owns only the bytes.
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

export type ParseResult = { ok: true; registry: BotRegistry } | { ok: false; message: string };

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
  // v3 files (no identity, no Dialogue names, no claim archived flag) are
  // read and upgraded here; serializeRegistry then writes v4.
  const sourceVersion = value.version;
  if (sourceVersion !== 3 && sourceVersion !== REGISTRY_VERSION) {
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
  const dialogues: Dialogue[] = [];
  const dialogueIds = new Set<string>();
  const sessionIds = new Set<string>();
  for (const item of value.dialogues) {
    const parsed = parseDialogue(item, sourceVersion);
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

function parseDialogue(value: unknown, version: number): Dialogue | string {
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
    claims,
  };
}

function parseClaims(value: unknown, version: number): SessionClaim[] | string {
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
    // Archived claims shipped after v3: older files have none archived.
    const archived = version === 3 ? false : item.archived;
    if (typeof archived !== "boolean") return "Dialogue 项无效。";
    claims.push({ sessionId, title: blankToNull(title), archived });
  }
  return claims;
}
