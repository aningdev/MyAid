/** Registry file vocabulary: version, rejection issues and the normalizers the file format shares. */
export const REGISTRY_VERSION = 4 as const;

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
