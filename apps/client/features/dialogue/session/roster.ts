/**
 * Deep module: claim × dsh listing × summary × occupancy → SessionRow.
 * Pure assembly; callers subscribe to rows and issue create/open elsewhere.
 */
import type { BotRegistry } from "../../bots/model";
import {
  listProductSessions,
  sessionLabel,
  type ListedSession,
  type ProductSession,
} from "../../bots/sessions";

export type SessionRow = {
  id: string;
  dialogueId: string;
  botId: string;
  botName: string;
  workspacePath: string;
  label: string;
  detail: string;
  archived: boolean;
  missing: boolean;
  running: boolean;
};

export function sessionDetail(
  item: Pick<ProductSession, "botName" | "archived" | "missing" | "workspacePath">,
  running: boolean,
): string {
  const bits = [item.botName, item.workspacePath];
  if (running) bits.push("执行中");
  if (item.archived) bits.push("已归档");
  if (item.missing) bits.push("待核对");
  return bits.join(" · ");
}

/** Join registry claims with optional dsh listing into product rows. */
export function buildSessionRoster(input: {
  registry: BotRegistry;
  listed: ListedSession[] | null;
  scopeDialogueId?: string | null;
  scopeBotId?: string | null;
  occupyingSessionId: string | null;
  summaries: Map<string, string>;
}): SessionRow[] {
  return listProductSessions(input.registry, input.listed, {
    dialogueId: input.scopeDialogueId ?? null,
    botId: input.scopeBotId ?? null,
  }).map((item) => {
    const running = input.occupyingSessionId === item.sessionId;
    return {
      id: item.sessionId,
      dialogueId: item.dialogueId,
      botId: item.botId,
      botName: item.botName,
      workspacePath: item.workspacePath,
      label: sessionLabel(item, input.summaries.get(item.sessionId) ?? null),
      detail: sessionDetail(item, running),
      archived: item.archived,
      missing: item.missing,
      running,
    };
  });
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

/** Refresh running flags after occupancy changes. */
export function withOccupancy(rows: SessionRow[], occupyingSessionId: string | null): SessionRow[] {
  return rows.map((row) => {
    const running = row.id === occupyingSessionId;
    return {
      ...row,
      running,
      detail: sessionDetail(row, running),
    };
  });
}
