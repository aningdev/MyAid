/**
 * The dsh Workspace projection the product reads: Workspace rows in Host
 * order, the pinned Session ids (most recent first) and the archived Session
 * ids. Pure shapes only — the live signal lives in `state.ts`, and the
 * official `ClientWorkspaceModel` snapshot is its only writer.
 */
import type { WorkspaceView } from "@myaid/dsh-web-protocol/workspace";

/** One Workspace, as the product needs it. */
export type WorkspaceRow = {
  id: string;
  /** Canonical Host path; the Dialogue's cwd is this. */
  path: string;
  /** Display title; the Dialogue's name is this one (shared across Bots). */
  title: string;
  /** Sessions accounted to it, in the person's manual order. */
  sessionIds: readonly string[];
  /** ISO-8601 last mutation: a newer row wins over a delayed one. */
  updatedAt: string;
};

export type WorkspaceProjection = {
  rows: readonly WorkspaceRow[];
  /** Registry-global archive set (dsh archives Sessions, not Workspaces). */
  archived: ReadonlySet<string>;
  /** Registry-global pin set, most recently pinned first. */
  pinned: readonly string[];
};

export const EMPTY_WORKSPACES: WorkspaceProjection = {
  rows: [],
  archived: new Set(),
  pinned: [],
};

/** What a Dialogue needs to resolve its Workspace. */
export type WorkspaceRef = { workspaceId: string };

export function workspaceOf(
  projection: WorkspaceProjection,
  dialogue: WorkspaceRef,
): WorkspaceRow | null {
  return projection.rows.find((row) => row.id === dialogue.workspaceId) ?? null;
}

/** The Dialogue's path; `""` until the Workspace baseline arrives. */
export function workspacePath(projection: WorkspaceProjection, dialogue: WorkspaceRef): string {
  return workspaceOf(projection, dialogue)?.path ?? "";
}

/** The Dialogue's display name (the Workspace title), or `""` when unknown. */
export function workspaceTitle(projection: WorkspaceProjection, dialogue: WorkspaceRef): string {
  return workspaceOf(projection, dialogue)?.title ?? "";
}

export function isSessionArchived(projection: WorkspaceProjection, sessionId: string): boolean {
  return projection.archived.has(sessionId);
}

export function isSessionPinned(projection: WorkspaceProjection, sessionId: string): boolean {
  return projection.pinned.includes(sessionId);
}

/** A Dialogue none of whose claimed Sessions is active (an empty one is not). */
export function isDialogueArchived(
  projection: WorkspaceProjection,
  dialogue: WorkspaceRef & { claims: readonly { sessionId: string }[] },
): boolean {
  return (
    dialogue.claims.length > 0 &&
    dialogue.claims.every((claim) => isSessionArchived(projection, claim.sessionId))
  );
}

/** The claims a group of ids names, in that order (dsh's own order). */
function rankOf(ids: readonly string[]): Map<string, number> {
  return new Map(ids.map((id, index) => [id, index]));
}

/**
 * Sort by `rank`, then put the unranked after them keeping their own order.
 * dsh's Workspace order and its Session order both read through this.
 */
function sortByRank<T>(
  items: readonly T[],
  rank: ReadonlyMap<string, number>,
  key: (item: T) => string,
): T[] {
  const placed = items
    .filter((item) => rank.has(key(item)))
    .sort((left, right) => (rank.get(key(left)) ?? 0) - (rank.get(key(right)) ?? 0));
  return [...placed, ...items.filter((item) => !rank.has(key(item)))];
}

/** Rows in dsh's Workspace order; a row the frame does not name keeps its place after them. */
export function sortRowsByIds(
  rows: readonly WorkspaceRow[],
  workspaceIds: readonly string[],
): WorkspaceRow[] {
  return sortByRank(rows, rankOf(workspaceIds), (row) => row.id);
}

/**
 * Dialogues in the Host's Workspace order; a Dialogue whose Workspace the
 * projection does not hold keeps the registry's order after them.
 */
export function orderedDialogues<T extends WorkspaceRef>(
  projection: WorkspaceProjection,
  dialogues: readonly T[],
): T[] {
  return sortByRank(
    dialogues,
    rankOf(projection.rows.map((row) => row.id)),
    (dialogue) => dialogue.workspaceId,
  );
}

/**
 * The Dialogue's Sessions in the Workspace's manual order. A claim the
 * Workspace does not account yet (a Session created before the attach echoed)
 * keeps the registry's order after them; archived Sessions are left out.
 */
export function orderedClaims<T extends { sessionId: string }>(
  projection: WorkspaceProjection,
  dialogue: WorkspaceRef,
  claims: readonly T[],
): T[] {
  const row = workspaceOf(projection, dialogue);
  return sortByRank(
    claims.filter((claim) => !isSessionArchived(projection, claim.sessionId)),
    rankOf(row?.sessionIds ?? []),
    (claim) => claim.sessionId,
  );
}

/** The pinned Sessions of one Dialogue, in pin order (most recent first). */
export function pinnedClaims<T extends { sessionId: string }>(
  projection: WorkspaceProjection,
  claims: readonly T[],
): T[] {
  const byId = new Map(claims.map((claim) => [claim.sessionId, claim]));
  const rows: T[] = [];
  for (const sessionId of projection.pinned) {
    if (isSessionArchived(projection, sessionId)) continue;
    const claim = byId.get(sessionId);
    if (claim) rows.push(claim);
  }
  return rows;
}

/** Turn one Workspace view into the product's row shape. */
export function workspaceRowOf(view: WorkspaceView): WorkspaceRow {
  return {
    id: view.workspaceId,
    path: view.path,
    title: view.title,
    sessionIds: [...view.sessionIds],
    updatedAt: view.updatedAt,
  };
}
