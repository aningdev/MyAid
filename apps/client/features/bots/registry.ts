/** Registry file vocabulary: version, rejection issues and the normalizers the file format shares. */

import { t } from "../../lib/i18n";
export const REGISTRY_VERSION = 6 as const;

export type RegistryIssue =
  | { code: "corrupt" }
  | { code: "legacy-version" }
  | { code: "invalid"; reason: string }
  | { code: "unsupported-version"; version: unknown }
  | { code: "not-found"; kind: "template" | "bot"; id: string }
  | { code: "missing-template"; templateId: string }
  | { code: "template-in-use"; templateId: string }
  | { code: "not-draft"; botId: string }
  | { code: "empty-workspace" }
  | { code: "frozen"; kind: "bot"; id: string; field: "templateId" }
  | { code: "empty-name" }
  | { code: "empty-preset" }
  | { code: "duplicate-id"; id: string }
  | { code: "not-ready"; botId: string }
  | { code: "session-claimed"; sessionId: string }
  | { code: "bot-has-dialogues"; botId: string }
  | { code: "segment-not-found"; sessionId: string };

export class RegistryRejection extends Error {
  readonly issue: RegistryIssue;

  constructor(issue: RegistryIssue) {
    super(rejectionMessage(issue));
    this.name = "RegistryRejection";
    this.issue = issue;
  }
}

export function rejectionMessage(issue: RegistryIssue): string {
  switch (issue.code) {
    case "corrupt":
      return t("registry.corrupt");
    case "legacy-version":
      return t("registry.legacy");
    case "invalid":
      return issue.reason;
    case "unsupported-version":
      return t("registry.tooOld");
    case "not-found":
      return t("registry.missingRecord");
    case "missing-template":
      return t("registry.templateGone");
    case "template-in-use":
      return t("registry.templateInUse");
    case "not-draft":
      return t("registry.botInitialized");
    case "empty-workspace":
      return t("registry.workspaceRequired");
    case "frozen":
      return t("registry.templateLocked");
    case "empty-name":
      return t("registry.nameEmpty");
    case "empty-preset":
      return t("registry.presetEmpty");
    case "duplicate-id":
      return t("registry.duplicateId");
    case "not-ready":
      return t("registry.beforeInit");
    case "session-claimed":
      return t("registry.sessionClaimed");
    case "bot-has-dialogues":
      return t("registry.alreadyHasConversation");
    case "segment-not-found":
      return t("registry.sessionMissing");
  }
}

export function blankToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function readRequiredString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export function readNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

/** A field that may be absent entirely (added after the first v3 files): `null` when missing. */
export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in record)) return null;
  return readNullableString(record, key);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
