/**
 * Workspace fixtures for harnesses and unit tests: the projection dsh's
 * `workspace.follow` would have delivered, without a Host.
 */
import type { WorkspaceBaseline } from "@myaid/dsh-web-protocol/workspace";

import {
  EMPTY_WORKSPACES,
  type WorkspaceProjection,
  type WorkspaceRow,
} from "../features/workspace/projection";
import { WORKSPACES_STORAGE_KEY } from "../features/workspace/state";

export function workspaceRow(
  input: { id: string; path: string } & Partial<Omit<WorkspaceRow, "id" | "path">>,
): WorkspaceRow {
  return {
    id: input.id,
    path: input.path,
    title: input.title ?? input.path.replace(/\/+$/, "").split("/").pop() ?? input.path,
    sessionIds: input.sessionIds ?? [],
    updatedAt: input.updatedAt ?? "2026-01-01T00:00:00.000Z",
  };
}

export function workspaceProjection(
  input: {
    rows?: readonly WorkspaceRow[];
    archived?: readonly string[];
    pinned?: readonly string[];
  } = {},
): WorkspaceProjection {
  return input.rows === undefined && input.archived === undefined && input.pinned === undefined
    ? EMPTY_WORKSPACES
    : {
        rows: input.rows ?? [],
        archived: new Set(input.archived ?? []),
        pinned: input.pinned ?? [],
      };
}

/**
 * The Storage entry a Host-less test app reads as its Workspace baseline:
 * the same values `workspace.follow` would have sent it.
 */
export function workspaceStorage(input: {
  rows?: readonly WorkspaceRow[];
  archived?: readonly string[];
  pinned?: readonly string[];
}): Record<string, string> {
  const baseline: WorkspaceBaseline = {
    items: (input.rows ?? []).map((row) => ({
      workspaceId: row.id as WorkspaceBaseline["items"][number]["workspaceId"],
      path: row.path,
      title: row.title,
      sessionIds: row.sessionIds as unknown as WorkspaceBaseline["items"][number]["sessionIds"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
    archivedSessionIds: (input.archived ??
      []) as unknown as WorkspaceBaseline["archivedSessionIds"],
    pinnedSessionIds: (input.pinned ?? []) as unknown as WorkspaceBaseline["pinnedSessionIds"],
  };
  return { [WORKSPACES_STORAGE_KEY]: JSON.stringify(baseline) };
}
