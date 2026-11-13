import { t } from "../../lib/i18n";
import type { WorkspaceProjection } from "../workspace/projection";
import { workspaceOf, workspacePath } from "../workspace/projection";
import type { BotRegistry, Segment } from "./model";

export type ListedSession = {
  sessionId: string;
  blank: boolean;
  updatedAt: number;
  /** Host-reported Agent state, also for Sessions this Client does not follow. */
  running?: boolean;
};

export type ProductSession = {
  sessionId: string;
  botId: string;
  botName: string;
  workspaceId: string;
  workspacePath: string;
  title: string | null;
  /** True only after dsh has been listed and this claim is absent. */
  missing: boolean;
  blank: boolean;
  updatedAt: number | null;
};

/**
 * A Bot's segments joined to a dsh listing and the Workspace projection, oldest
 * first (the order they were claimed). `listed === null` means the listing is
 * unknown. An archive in dsh does not hide a segment: the product has no
 * per-segment archive.
 */
export function listProductSessions(
  registry: BotRegistry,
  listed: ListedSession[] | null,
  workspaces: WorkspaceProjection,
  scope: { botId?: string | null } = {},
): ProductSession[] {
  const known = listed ? new Map(listed.map((item) => [item.sessionId, item])) : null;
  const rows: ProductSession[] = [];
  for (const bot of registry.bots) {
    if (scope.botId && bot.id !== scope.botId) continue;
    for (const segment of bot.segments) {
      const info = known?.get(segment.sessionId);
      rows.push({
        sessionId: segment.sessionId,
        botId: bot.id,
        botName: bot.name,
        workspaceId: segment.workspaceId,
        workspacePath: workspacePath(workspaces, segment),
        title: segment.title,
        missing: known ? !info : false,
        blank: info?.blank ?? false,
        updatedAt: info?.updatedAt ?? null,
      });
    }
  }
  return rows;
}

/** Claim title, else a transient summary. The summary is not stored on the segment. */
export function sessionLabel(
  session: Pick<ProductSession, "title">,
  summary: string | null,
): string {
  if (session.title) return session.title;
  const text = summary?.trim();
  if (!text) return t("facts.untitledContext");
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

/** A segment as the Pane and the history rail read it. */
export type ConversationSegment = {
  /** Position in the Bot's long conversation, oldest = 0. */
  index: number;
  sessionId: string;
  workspaceId: string;
  /** dsh's canonical directory, `""` until the Workspace baseline arrives. */
  path: string;
  title: string | null;
  /** True for the last segment: the one that accepts prompts. */
  current: boolean;
  /** When it was last active, from the dsh listing (null: unknown). */
  updatedAt: number | null;
  missing: boolean;
};

/** One Bot's long conversation, oldest segment first. */
export function conversationOf(
  registry: BotRegistry,
  workspaces: WorkspaceProjection,
  listed: ListedSession[] | null,
  botId: string,
): ConversationSegment[] {
  const bot = registry.bots.find((item) => item.id === botId);
  if (!bot) return [];
  const known = listed ? new Map(listed.map((item) => [item.sessionId, item])) : null;
  return bot.segments.map((segment, index) => {
    const stamp = known?.get(segment.sessionId)?.updatedAt ?? null;
    return {
      index,
      sessionId: segment.sessionId,
      workspaceId: segment.workspaceId,
      path: workspacePath(workspaces, segment),
      title: segment.title,
      current: index === bot.segments.length - 1,
      // 0 is the listing's "no stamp", not 1970: the divider falls back to now.
      updatedAt: stamp !== null && stamp > 0 ? stamp : null,
      missing: known ? !known.has(segment.sessionId) : false,
    };
  });
}

/** The Bot's current working directory: the latest segment's Workspace path. */
export function workingDirectoryOf(
  registry: BotRegistry,
  workspaces: WorkspaceProjection,
  botId: string,
): string {
  const bot = registry.bots.find((item) => item.id === botId);
  const latest = bot?.segments[bot.segments.length - 1];
  if (!latest) return bot?.defaultWorkspacePath ?? "";
  return workspaceOf(workspaces, latest)?.path ?? "";
}

/** The segment a Bot's Pane shows and accepts prompts in: its latest. */
export type CurrentSegment = {
  index: number;
  segment: Segment;
  workspacePath: string;
  title: string | null;
};

export function currentSegmentOf(input: {
  registry: BotRegistry;
  workspaces: WorkspaceProjection;
  botId: string;
}): CurrentSegment | null {
  const bot = input.registry.bots.find((item) => item.id === input.botId);
  if (!bot || bot.segments.length === 0) return null;
  const index = bot.segments.length - 1;
  const segment = bot.segments[index]!;
  return {
    index,
    segment,
    workspacePath: workspacePath(input.workspaces, segment),
    title: segment.title,
  };
}

/** A Bot's most recent activity, in milliseconds: its Workspaces and its Segments. */
export function botActivity(
  registry: BotRegistry,
  workspaces: WorkspaceProjection,
  rows: readonly { botId: string; updatedAt: number | null }[],
  botId: string,
): number {
  let at = 0;
  const bot = registry.bots.find((item) => item.id === botId);
  for (const segment of bot?.segments ?? []) {
    const stamp = Date.parse(workspaceOf(workspaces, segment)?.updatedAt ?? "");
    if (Number.isFinite(stamp) && stamp > at) at = stamp;
  }
  for (const row of rows) {
    if (row.botId !== botId || row.updatedAt === null) continue;
    if (row.updatedAt > at) at = row.updatedAt;
  }
  return at;
}
