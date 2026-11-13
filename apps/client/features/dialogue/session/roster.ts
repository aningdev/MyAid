/**
 * Deep module: claim × dsh listing × summary × controller status → SessionRow.
 * Pure assembly; callers subscribe to rows and issue create/open elsewhere.
 */
import type { BotRegistry } from "../../bots/model";
import {
  listProductSessions,
  sessionLabel,
  type ListedSession,
  type ProductSession,
} from "../../bots/sessions";
import type { WorkspaceProjection } from "../../workspace/projection";
import { orderedClaims } from "../../workspace/projection";

/** Live status a SessionController (or a finished off-screen turn) reports. */
export type SessionStatus = {
  running: boolean;
  unread: boolean;
  attention: boolean;
};

export type SessionRow = {
  id: string;
  dialogueId: string;
  botId: string;
  botName: string;
  workspacePath: string;
  label: string;
  detail: string;
  missing: boolean;
  running: boolean;
  /** A reply finished while no Panel showed this Session. */
  unread: boolean;
  /** An approval is waiting for this Session. */
  attention: boolean;
};

export function sessionDetail(
  item: Pick<ProductSession, "botName" | "missing" | "workspacePath">,
  running: boolean,
): string {
  const bits = [item.botName, item.workspacePath];
  if (running) bits.push("执行中");
  if (item.missing) bits.push("待核对");
  return bits.join(" · ");
}

/** Join registry claims with optional dsh listing into product rows. */
export function buildSessionRoster(input: {
  registry: BotRegistry;
  listed: ListedSession[] | null;
  workspaces: WorkspaceProjection;
  scopeDialogueId?: string | null;
  scopeBotId?: string | null;
  summaries: Map<string, string>;
}): SessionRow[] {
  const listedRunning = new Map(
    (input.listed ?? []).map((item) => [item.sessionId, item.running === true]),
  );
  return listProductSessions(input.registry, input.listed, input.workspaces, {
    dialogueId: input.scopeDialogueId ?? null,
    botId: input.scopeBotId ?? null,
  }).map((item) => {
    // Host list state covers Sessions this Client does not follow; a
    // controller's own state is applied later and wins over it.
    const running = listedRunning.get(item.sessionId) ?? false;
    return {
      id: item.sessionId,
      dialogueId: item.dialogueId,
      botId: item.botId,
      botName: item.botName,
      workspacePath: item.workspacePath,
      label: sessionLabel(item, input.summaries.get(item.sessionId) ?? null),
      detail: sessionDetail(item, running),
      missing: item.missing,
      running,
      unread: false,
      attention: false,
    };
  });
}

/** Row decorations from live controller state; a followed Session's state wins over the listing. */
export function withStatuses(
  rows: readonly SessionRow[],
  statuses: ReadonlyMap<string, SessionStatus>,
): SessionRow[] {
  return rows.map((row) => {
    const status = statuses.get(row.id);
    const running = status ? status.running : row.running;
    return {
      ...row,
      running,
      unread: status?.unread ?? false,
      attention: status?.attention ?? false,
      detail: sessionDetail(row, running),
    };
  });
}

/**
 * One Dialogue's rows in the Workspace's own Session order, then any row the
 * Workspace no longer accounts (a claim dsh did not report, kept visible).
 * Open Panels read this, not a scope signal.
 */
export function rosterForDialogue(input: {
  registry: BotRegistry;
  dialogueId: string;
  rows: readonly SessionRow[];
  workspaces: WorkspaceProjection;
}): SessionRow[] {
  const dialogue = input.registry.dialogues.find((item) => item.id === input.dialogueId);
  const live = new Map(input.rows.map((row) => [row.id, row]));
  const claimed = new Map(
    listProductSessions(input.registry, null, input.workspaces, {
      dialogueId: input.dialogueId,
    }).map((item) => [item.sessionId, item]),
  );
  const ordered: SessionRow[] = [];
  const seen = new Set<string>();
  for (const claim of dialogue ? orderedClaims(input.workspaces, dialogue, dialogue.claims) : []) {
    seen.add(claim.sessionId);
    const row = live.get(claim.sessionId);
    if (row) {
      ordered.push(row);
      continue;
    }
    const item = claimed.get(claim.sessionId);
    if (!item) continue;
    ordered.push({
      id: item.sessionId,
      dialogueId: item.dialogueId,
      botId: item.botId,
      botName: item.botName,
      workspacePath: item.workspacePath,
      label: sessionLabel(item, null),
      detail: sessionDetail(item, false),
      missing: false,
      running: false,
      unread: false,
      attention: false,
    });
  }
  const rest = input.rows.filter((row) => row.dialogueId === input.dialogueId && !seen.has(row.id));
  return [...ordered, ...rest];
}

/** Relabel one row after a transient summary changes. */
export function relabelRow(
  rows: SessionRow[],
  sessionId: string,
  title: string | null,
  summary: string,
): SessionRow[] {
  const label = sessionLabel({ title }, summary);
  return rows.map((row) => (row.id === sessionId ? { ...row, label } : row));
}
