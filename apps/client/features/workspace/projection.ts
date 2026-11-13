/**
 * The dsh Workspace projection the product reads: Workspace rows in Host
 * order, the pinned Session ids (most recent first) and the archived Session
 * ids. Pure shapes only — the live signal lives in `state.ts`, and dsh's
 * `workspace.follow` stream is its only writer.
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

/**
 * Dialogues in the Host's Workspace order; a Dialogue whose Workspace the
 * projection does not hold keeps the registry's order after them.
 */
export function orderedDialogues<T extends WorkspaceRef>(
  projection: WorkspaceProjection,
  dialogues: readonly T[],
): T[] {
  const rank = new Map(projection.rows.map((row, index) => [row.id, index]));
  const known = dialogues.filter((dialogue) => rank.has(dialogue.workspaceId));
  const unknown = dialogues.filter((dialogue) => !rank.has(dialogue.workspaceId));
  known.sort(
    (left, right) => (rank.get(left.workspaceId) ?? 0) - (rank.get(right.workspaceId) ?? 0),
  );
  return [...known, ...unknown];
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
  const rank = new Map((row?.sessionIds ?? []).map((id, index) => [id, index]));
  const known = claims.filter(
    (claim) => rank.has(claim.sessionId) && !projection.archived.has(claim.sessionId),
  );
  const unknown = claims.filter(
    (claim) => !rank.has(claim.sessionId) && !projection.archived.has(claim.sessionId),
  );
  known.sort((left, right) => (rank.get(left.sessionId) ?? 0) - (rank.get(right.sessionId) ?? 0));
  return [...known, ...unknown];
}

/** The pinned Sessions of one Dialogue, in pin order (most recent first). */
export function pinnedClaims<T extends { sessionId: string }>(
  projection: WorkspaceProjection,
  claims: readonly T[],
): T[] {
  const byId = new Map(claims.map((claim) => [claim.sessionId, claim]));
  const rows: T[] = [];
  for (const sessionId of projection.pinned) {
    if (projection.archived.has(sessionId)) continue;
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
