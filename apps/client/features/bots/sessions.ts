import type { BotRegistry } from "./model";

export type ListedSession = {
  sessionId: string;
  blank: boolean;
  updatedAt: number;
};

export type ProductSession = {
  sessionId: string;
  dialogueId: string;
  botId: string;
  botName: string;
  workspacePath: string;
  title: string | null;
  /** True when the owning Dialogue is archived. */
  archived: boolean;
  /** True only after dsh has been listed and this claim is absent. */
  missing: boolean;
  blank: boolean;
  updatedAt: number | null;
};

/** Claims joined to a dsh listing. `listed === null` means the listing is unknown. */
export function listProductSessions(
  registry: BotRegistry,
  listed: ListedSession[] | null,
  scope: { dialogueId?: string | null; botId?: string | null } = {},
): ProductSession[] {
  const known = listed ? new Map(listed.map((item) => [item.sessionId, item])) : null;
  const rows: ProductSession[] = [];
  const botById = new Map(registry.bots.map((bot) => [bot.id, bot]));
  for (const dialogue of registry.dialogues) {
    if (scope.dialogueId && dialogue.id !== scope.dialogueId) continue;
    if (scope.botId && dialogue.botId !== scope.botId) continue;
    const bot = botById.get(dialogue.botId);
    if (!bot) continue;
    for (const claim of dialogue.claims) {
      const info = known?.get(claim.sessionId);
      rows.push({
        sessionId: claim.sessionId,
        dialogueId: dialogue.id,
        botId: bot.id,
        botName: bot.name,
        workspacePath: dialogue.workspacePath,
        title: claim.title,
        archived: dialogue.archived,
        missing: known ? !info : false,
        blank: info?.blank ?? false,
        updatedAt: info?.updatedAt ?? null,
      });
    }
  }
  rows.sort((a, b) => {
    if (a.updatedAt === null && b.updatedAt === null) {
      return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
    }
    if (a.updatedAt === null) return 1;
    if (b.updatedAt === null) return -1;
    return b.updatedAt - a.updatedAt;
  });
  return rows;
}

/** Claim title, else a transient summary. The summary is not stored on the claim. */
export function sessionLabel(
  session: Pick<ProductSession, "title">,
  summary: string | null,
): string {
  if (session.title) return session.title;
  const text = summary?.trim();
  if (!text) return "未命名上下文";
  return text.length > 32 ? `${text.slice(0, 32)}…` : text;
}

export function workspaceKey(path: string): string {
  const trimmed = path.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}
