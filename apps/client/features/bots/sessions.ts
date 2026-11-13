import type { WorkspaceProjection } from "../workspace/projection";
import {
  isSessionArchived,
  orderedClaims,
  orderedDialogues,
  workspaceOf,
  workspacePath,
} from "../workspace/projection";
import type { BotRegistry, Dialogue } from "./model";

export type ListedSession = {
  sessionId: string;
  blank: boolean;
  updatedAt: number;
  /** Host-reported Agent state, also for Sessions this Client does not follow. */
  running?: boolean;
};

export type ProductSession = {
  sessionId: string;
  dialogueId: string;
  botId: string;
  botName: string;
  workspacePath: string;
  title: string | null;
  /** True only after dsh has been listed and this claim is absent. */
  missing: boolean;
  blank: boolean;
  updatedAt: number | null;
};

/**
 * Claims joined to a dsh listing and the Workspace projection. `listed ===
 * null` means the listing is unknown; a Session dsh archived leaves the lists.
 */
export function listProductSessions(
  registry: BotRegistry,
  listed: ListedSession[] | null,
  workspaces: WorkspaceProjection,
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
      // dsh keeps an archived Session; it leaves the product's lists.
      if (isSessionArchived(workspaces, claim.sessionId)) continue;
      const info = known?.get(claim.sessionId);
      rows.push({
        sessionId: claim.sessionId,
        dialogueId: dialogue.id,
        botId: bot.id,
        botName: bot.name,
        workspacePath: workspacePath(workspaces, dialogue),
        title: claim.title,
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

/**
 * A Session's name from its first prompt: one line, its first sentence, at
 * most `max` characters. Empty prompts name nothing.
 */
export function titleFromPrompt(text: string, max = 40): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return "";
  const stop = line.search(/[.!?。！？]\s/);
  const one = stop > 0 ? line.slice(0, stop) : line;
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/**
 * The dialogue a Bot's conversation currently opens on: its most recently
 * active one (dsh's Workspace `updatedAt`), preferring one that still claims a
 * live Session. Until the Bot's own long conversation lands (L2), this is the
 * stand-in the Pane reads.
 */
export function currentDialogueOf(
  registry: BotRegistry,
  workspaces: WorkspaceProjection,
  botId: string,
): Dialogue | null {
  const dialogues = orderedDialogues(
    workspaces,
    registry.dialogues.filter((dialogue) => dialogue.botId === botId),
  );
  const live = (dialogue: Dialogue) =>
    dialogue.claims.some((claim) => !isSessionArchived(workspaces, claim.sessionId));
  return dialogues.find(live) ?? dialogues[0] ?? null;
}

/** A Bot's current segment: the Session its Pane shows now. */
export type CurrentSession = {
  dialogueId: string;
  sessionId: string;
  workspacePath: string;
  /** The person's name for it, when they gave one. */
  title: string | null;
};

/**
 * The Session a Bot's Pane shows: the one that moved most recently (the dsh
 * listing's `updatedAt`, which the roster sorts by), else the newest claim in
 * its most active dialogue's dsh order. L2 replaces this with the Bot's own
 * long conversation.
 */
export function currentSessionOf(input: {
  registry: BotRegistry;
  workspaces: WorkspaceProjection;
  rows: readonly { id: string; botId: string }[];
  botId: string;
}): CurrentSession | null {
  const row = input.rows.find((item) => item.botId === input.botId);
  const dialogue = currentDialogueOf(input.registry, input.workspaces, input.botId);
  if (!dialogue) return null;
  const claimOf = (sessionId: string) =>
    dialogue.claims.find((claim) => claim.sessionId === sessionId) ?? null;
  if (row) {
    const claim = claimOf(row.id);
    return claim
      ? {
          dialogueId: dialogue.id,
          sessionId: claim.sessionId,
          workspacePath: workspacePath(input.workspaces, dialogue),
          title: claim.title,
        }
      : null;
  }
  const live = orderedClaims(input.workspaces, dialogue, dialogue.claims).filter(
    (claim) => !isSessionArchived(input.workspaces, claim.sessionId),
  );
  const claim = live[live.length - 1];
  if (!claim) return null;
  return {
    dialogueId: dialogue.id,
    sessionId: claim.sessionId,
    workspacePath: workspacePath(input.workspaces, dialogue),
    title: claim.title,
  };
}

/** A Bot's most recent activity, in milliseconds: its Workspaces and its live Sessions. */
export function botActivity(
  registry: BotRegistry,
  workspaces: WorkspaceProjection,
  rows: readonly { botId: string; updatedAt: number | null }[],
  botId: string,
): number {
  let at = 0;
  for (const dialogue of registry.dialogues) {
    if (dialogue.botId !== botId) continue;
    const stamp = Date.parse(workspaceOf(workspaces, dialogue)?.updatedAt ?? "");
    if (Number.isFinite(stamp) && stamp > at) at = stamp;
  }
  for (const row of rows) {
    if (row.botId !== botId || row.updatedAt === null) continue;
    if (row.updatedAt > at) at = row.updatedAt;
  }
  return at;
}
