/**
 * Registry file format: parse (v6, and the v3 / v4 / v5 files that still need
 * a Host to migrate) and serialize. The domain model and its mutations live in
 * `model.ts`; this module owns only the bytes.
 */

import { t } from "../../lib/i18n";
import { defaultIdentity, readIdentity } from "./identity";
import type { Bot, BotRegistry, BotTemplate, Segment } from "./model";
import {
  blankToNull,
  DERIVED_PRESET_PREFIX,
  isRecord,
  readNullableString,
  readOptionalString,
  readRequiredString,
  REGISTRY_VERSION,
  rejectionMessage,
} from "./registry";

/**
 * A v3 / v4 Dialogue: it carries its own path, name and archive flag, which
 * dsh's Workspace must take over before the file can be migrated.
 */
export type LegacyDialogue = {
  id: string;
  botId: string;
  workspacePath: string;
  /** The person's own name; `null` reads as the workspace's last segment. */
  name: string | null;
  archived: boolean;
  claims: (LegacyClaim & { archived: boolean })[];
};

type LegacyClaim = { sessionId: string; title: string | null };

/**
 * A v5 Dialogue: it already names a dsh Workspace, but the Bot's conversation
 * is still split across Dialogues. The migration merges its claims into the
 * Bot's segments.
 */
export type PreviousDialogue = {
  id: string;
  botId: string;
  workspaceId: string;
  claims: LegacyClaim[];
};

/** A pre-v6 file: the same Bots, Dialogues that still own the conversation. */
export type LegacyRegistry = {
  version: 3 | 4 | 5;
  templates: BotTemplate[];
  bots: Bot[];
  dialogues: (LegacyDialogue | PreviousDialogue)[];
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
    return { ok: false, message: t("registry.notJson") };
  }
  if (!isRecord(value)) {
    return { ok: false, message: t("registry.notObject") };
  }
  const sourceVersion = value.version;
  if (
    sourceVersion !== 3 &&
    sourceVersion !== 4 &&
    sourceVersion !== 5 &&
    sourceVersion !== REGISTRY_VERSION
  ) {
    return {
      ok: false,
      message: rejectionMessage({ code: "unsupported-version", version: sourceVersion }),
    };
  }
  if (!Array.isArray(value.templates) || !Array.isArray(value.bots)) {
    return { ok: false, message: t("registry.missingLists") };
  }
  const legacy = sourceVersion === 3 || sourceVersion === 4 || sourceVersion === 5;
  if (legacy && !Array.isArray(value.dialogues)) {
    return { ok: false, message: t("registry.missingDialogues") };
  }
  const templates: BotTemplate[] = [];
  const templateIds = new Set<string>();
  for (const item of value.templates) {
    const parsed = parseTemplate(item);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    if (templateIds.has(parsed.id)) return { ok: false, message: t("registry.duplicateTemplate") };
    templateIds.add(parsed.id);
    templates.push(parsed);
  }
  const bots: Bot[] = [];
  const botIds = new Set<string>();
  for (const item of value.bots) {
    const parsed = parseBot(item, sourceVersion, legacy ? [] : undefined);
    if (typeof parsed === "string") return { ok: false, message: parsed };
    if (botIds.has(parsed.id)) return { ok: false, message: t("registry.duplicateBot") };
    if (!templateIds.has(parsed.templateId)) {
      return { ok: false, message: t("registry.botTemplateMissing") };
    }
    botIds.add(parsed.id);
    bots.push(parsed);
  }
  const sessionIds = new Set<string>();
  for (const bot of bots) {
    for (const segment of bot.segments) {
      if (sessionIds.has(segment.sessionId))
        return { ok: false, message: t("registry.duplicateSession") };
      sessionIds.add(segment.sessionId);
    }
  }
  if (legacy) {
    const dialogues: (LegacyDialogue | PreviousDialogue)[] = [];
    const dialogueIds = new Set<string>();
    for (const item of value.dialogues as unknown[]) {
      const parsed =
        sourceVersion === 5
          ? parsePreviousDialogue(item)
          : parseLegacyDialogue(item, sourceVersion);
      if (typeof parsed === "string") return { ok: false, message: parsed };
      if (dialogueIds.has(parsed.id))
        return { ok: false, message: t("registry.duplicateDialogue") };
      if (!botIds.has(parsed.botId)) {
        return { ok: false, message: t("registry.dialogueBotMissing") };
      }
      for (const claim of parsed.claims) {
        if (sessionIds.has(claim.sessionId)) {
          return { ok: false, message: t("registry.duplicateSession") };
        }
        sessionIds.add(claim.sessionId);
      }
      dialogueIds.add(parsed.id);
      dialogues.push(parsed);
    }
    for (const bot of bots) {
      if (dialogues.some((item) => item.botId === bot.id) && !bot.hadDialogue) {
        return { ok: false, message: t("registry.botHadDialogue") };
      }
    }
    return {
      ok: true,
      state: "legacy",
      legacy: { version: sourceVersion as 3 | 4 | 5, templates, bots, dialogues },
    };
  }
  for (const bot of bots) {
    if (bot.segments.length > 0 && !bot.hadDialogue) {
      return { ok: false, message: t("registry.botHadSegment") };
    }
  }
  return {
    ok: true,
    state: "current",
    registry: { version: REGISTRY_VERSION, templates, bots },
  };
}

function parseTemplate(value: unknown): BotTemplate | string {
  if (!isRecord(value)) return t("registry.badTemplate");
  const id = readRequiredString(value, "id");
  const name = readRequiredString(value, "name");
  const presetId = readRequiredString(value, "presetId");
  if (!id || !name || !presetId) return t("registry.badTemplate");
  if (!name.trim() || !presetId.trim()) return t("registry.badTemplate");
  return { id, name: name.trim(), presetId: presetId.trim() };
}

function parseBot(
  value: unknown,
  version: number,
  legacySegments?: readonly Segment[],
): Bot | string {
  if (!isRecord(value)) return t("registry.badBot");
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
  if (!id || !name?.trim() || !templateId) return t("registry.badBot");
  if (status !== "draft" && status !== "ready") return t("registry.badBot");
  if (defaultModel === undefined || boundPresetId === undefined || derivedPresetId === undefined) {
    return t("registry.badBot");
  }
  if (
    description === undefined ||
    defaultThinking === undefined ||
    defaultWorkspacePath === undefined
  ) {
    return t("registry.badBot");
  }
  const storedDerived = blankToNull(derivedPresetId);
  const derived = derivedPreset(storedDerived);
  // A ready Bot runs some preset: a bound one, a derived one, or — when the
  // stored derived id came from another writer and was dropped just above — its
  // template's, until the next capability save derives a new one.
  const inheritsAfterDrop = storedDerived !== null && derived === null;
  if (status === "ready" && !blankToNull(boundPresetId) && derived === null && !inheritsAfterDrop) {
    return t("registry.badBot");
  }
  if (typeof value.hadDialogue !== "boolean") return t("registry.badBot");
  // Archived shipped after v3: absent reads as not archived, a present value must be a boolean.
  if ("archived" in value && typeof value.archived !== "boolean") return t("registry.badBot");
  let segments: Segment[];
  if (legacySegments !== undefined) {
    segments = [...legacySegments];
  } else {
    const parsed = parseSegments(value.segments);
    if (typeof parsed === "string") return parsed;
    segments = parsed;
  }
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
    archived: value.archived === true,
    status,
    boundPresetId: blankToNull(boundPresetId),
    derivedPresetId: derived,
    segments,
  };
}

/**
 * Keep a derived preset id only when it carries this product's namespace.
 *
 * A file written by another preset plugin (or before the namespace moved) names
 * a preset nothing here can read or update, so the Bot goes back to its bound or
 * template preset and derives a fresh one the next time capabilities are saved.
 * @param id - the stored id, already blank-normalized.
 * @returns the same id, or null when it is outside the namespace.
 */
function derivedPreset(id: string | null): string | null {
  return id !== null && id.startsWith(DERIVED_PRESET_PREFIX) ? id : null;
}

function parseSegments(value: unknown): Segment[] | string {
  if (!Array.isArray(value)) return t("registry.badBot");
  const segments: Segment[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return t("registry.badBot");
    const sessionId = readRequiredString(item, "sessionId")?.trim();
    const workspaceId = readRequiredString(item, "workspaceId")?.trim();
    const title = readNullableString(item, "title");
    if (!sessionId || !workspaceId || title === undefined) return t("registry.badBot");
    if (seen.has(sessionId)) return t("registry.badBot");
    seen.add(sessionId);
    segments.push({ sessionId, workspaceId, title: blankToNull(title) });
  }
  return segments;
}

function parsePreviousDialogue(value: unknown): PreviousDialogue | string {
  if (!isRecord(value)) return t("registry.badDialogue");
  const id = readRequiredString(value, "id");
  const botId = readRequiredString(value, "botId");
  const workspaceId = readRequiredString(value, "workspaceId");
  if (!id || !botId || !workspaceId?.trim()) return t("registry.badDialogue");
  const claims = parseClaims(value.claims, 5);
  if (typeof claims === "string") return claims;
  return {
    id,
    botId,
    workspaceId: workspaceId.trim(),
    claims: claims.map(({ sessionId, title }) => ({ sessionId, title })),
  };
}

function parseLegacyDialogue(value: unknown, version: 3 | 4): LegacyDialogue | string {
  if (!isRecord(value)) return t("registry.badDialogue");
  const id = readRequiredString(value, "id");
  const botId = readRequiredString(value, "botId");
  const workspacePath = readRequiredString(value, "workspacePath");
  if (!id || !botId || workspacePath === undefined) return t("registry.badDialogue");
  if (!workspacePath.trim()) return t("registry.badDialogue");
  if (typeof value.archived !== "boolean") return t("registry.badDialogue");
  // Names shipped after v3: an older file reads its workspace's segment.
  const name = version === 3 ? null : readOptionalString(value, "name");
  if (name === undefined) return t("registry.badDialogue");
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
): (LegacyClaim & { archived?: boolean })[] | string {
  if (!Array.isArray(value)) return t("registry.badDialogue");
  const claims: (LegacyClaim & { archived?: boolean })[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) return t("registry.badDialogue");
    const sessionId = readRequiredString(item, "sessionId")?.trim();
    const title = readNullableString(item, "title");
    if (!sessionId || title === undefined) return t("registry.badDialogue");
    if (seen.has(sessionId)) return t("registry.badDialogue");
    seen.add(sessionId);
    // Archived claims shipped after v3, and only a v4 file still carries them.
    const archived = version === 3 ? false : version === 4 ? item.archived : undefined;
    if (version === 4 && typeof archived !== "boolean") return t("registry.badDialogue");
    claims.push({
      sessionId,
      title: blankToNull(title),
      ...(typeof archived === "boolean" ? { archived } : {}),
    });
  }
  return claims;
}
