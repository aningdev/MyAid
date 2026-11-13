/**
 * The wire boundary for `workspace.follow`. The Remote's frames are typed by
 * the protocol package, but the bytes come from another process: every frame
 * is checked here, once, so the projection downstream never sees a shape it
 * did not validate. A malformed frame ends the stream (the loop reconnects and
 * starts from a fresh baseline) instead of half-updating the tree.
 */
import type { SessionId } from "@myaid/dsh-web-protocol/session";
import type {
  WorkspaceBaseline,
  WorkspaceFollowFrame,
  WorkspaceView,
  WorkspaceId,
} from "@myaid/dsh-web-protocol/workspace";

export class WorkspaceFrameError extends Error {
  constructor(readonly detail: string) {
    super(`workspace/frame-invalid: ${detail}`);
    this.name = "WorkspaceFrameError";
  }
}

/** One `workspace.follow` frame, or a rejection naming the bad field. */
export function decodeWorkspaceFrame(value: unknown): WorkspaceFollowFrame {
  const frame = record(value, "frame");
  const type = text(frame.type, "frame.type");
  switch (type) {
    case "baseline":
      return { type, value: decodeWorkspaceBaseline(frame.value) };
    case "replace":
      return { type, value: decodeWorkspaceBaseline(frame.value) };
    case "upsert":
      return { type, workspace: decodeWorkspaceView(frame.workspace, "frame.workspace") };
    case "remove":
      return { type, workspaceId: workspaceId(frame.workspaceId, "frame.workspaceId") };
    case "order":
      return {
        type,
        workspaceIds: workspaceIds(frame.workspaceIds, "frame.workspaceIds"),
      };
    case "archived":
      return {
        type,
        archivedSessionIds: sessionIds(frame.archivedSessionIds, "frame.archivedSessionIds"),
      };
    case "pinned":
      return {
        type,
        pinnedSessionIds: sessionIds(frame.pinnedSessionIds, "frame.pinnedSessionIds"),
      };
    default:
      throw new WorkspaceFrameError(`unknown frame type ${JSON.stringify(type)}`);
  }
}

/** A reconnect baseline (also the test fixture's shape). */
export function decodeWorkspaceBaseline(value: unknown): WorkspaceBaseline {
  const baseline = record(value, "baseline");
  return {
    items: array(baseline.items, "baseline.items").map((item, index) =>
      decodeWorkspaceView(item, `baseline.items[${index}]`),
    ),
    archivedSessionIds: sessionIds(baseline.archivedSessionIds, "baseline.archivedSessionIds"),
    pinnedSessionIds: sessionIds(baseline.pinnedSessionIds, "baseline.pinnedSessionIds"),
  };
}

/** One Workspace row. */
export function decodeWorkspaceView(value: unknown, at: string): WorkspaceView {
  const view = record(value, at);
  return {
    workspaceId: workspaceId(view.workspaceId, `${at}.workspaceId`),
    path: text(view.path, `${at}.path`),
    title: text(view.title, `${at}.title`),
    sessionIds: sessionIds(view.sessionIds, `${at}.sessionIds`),
    createdAt: text(view.createdAt, `${at}.createdAt`),
    updatedAt: text(view.updatedAt, `${at}.updatedAt`),
  };
}

function record(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new WorkspaceFrameError(`${at} is not an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, at: string): string {
  if (typeof value !== "string") throw new WorkspaceFrameError(`${at} is not a string`);
  return value;
}

function array(value: unknown, at: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new WorkspaceFrameError(`${at} is not an array`);
  return value;
}

/** A branded id is a plain string on the wire; this is where it gets its brand. */
function workspaceId(value: unknown, at: string): WorkspaceId {
  return text(value, at) as WorkspaceId;
}

function workspaceIds(value: unknown, at: string): WorkspaceId[] {
  return array(value, at).map((item, index) => workspaceId(item, `${at}[${index}]`));
}

function sessionIds(value: unknown, at: string): SessionId[] {
  return array(value, at).map((item, index) => text(item, `${at}[${index}]`) as SessionId);
}
