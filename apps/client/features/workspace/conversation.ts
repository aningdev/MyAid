/**
 * The product commands that start a segment of a Bot's long conversation: the
 * Bot's working directory resolves to a dsh Workspace (created when the
 * directory is new), a Session is created there, and the claim appends the
 * segment. Changing the directory and 「新话题」 / `/new` both go through here;
 * nothing else in the UI creates a Session.
 *
 * The registry write and the dsh calls are separate steps on purpose — each
 * object keeps its own owner, and the UI reads the result from dsh's follow
 * stream. `SegmentStarter` is the seam `nsh test` substitutes without a Host.
 */
import { updateBot } from "../bots/model";
import { workingDirectoryOf } from "../bots/sessions";
import { changeRegistry, registry, setActionError } from "../bots/state";
import { createSegment } from "../dialogue/session/runtime";
import { trimPath } from "./paths";
import { workspaces } from "./state";

/** The three things starting a segment needs from dsh / the registry. */
export type SegmentStarter = {
  /** The Workspace over `path`; the same canonical path reuses its Workspace. */
  workspace(path: string): Promise<{ id: string }>;
  /** Create the Session there and append it as the Bot's next segment. */
  createSession(botId: string, workspaceId: string): Promise<string>;
  /** Remember the directory for the Bot's next segment (a registry preference). */
  rememberPath(botId: string, path: string): Promise<void>;
  /** Ask the person for a directory when the Bot has none yet. */
  pickDirectory(): Promise<string | null>;
};

/** A test substitutes the Host-facing steps; the product never sets this. */
let substituted: SegmentStarter | undefined;

export function setSegmentStarter(next: SegmentStarter | undefined): void {
  substituted = next;
}

/** The official Workspace model, from the shared Connection. */
async function workspaceModel(): Promise<import("@myaid/dsh-web-protocol/client").IWorkspaces> {
  const api = await import("../../lib/dsh/session");
  const connection = await api.ensureConnected();
  return connection.workspaces;
}

/** The product's starter: the official Workspace model, the Session runtime. */
function productStarter(): SegmentStarter {
  return {
    async workspace(path) {
      const { openWorkspace } = await import("./state");
      const model = await workspaceModel();
      const row = await openWorkspace(model, path);
      return { id: row.id };
    },
    createSession: (botId, workspaceId) => createSegment(botId, workspaceId),
    async rememberPath(botId, path) {
      await changeRegistry((reg) => updateBot(reg, botId, { defaultWorkspacePath: path }));
    },
    async pickDirectory() {
      const { pickDirectory } = await import("../../lib/dsh/session");
      return pickDirectory();
    },
  };
}

/** `~` and `~/…` in a path a person typed, before dsh canonicalizes it. */
export async function expandHome(path: string): Promise<string> {
  const trimmed = path.trim();
  if (trimmed !== "~" && !trimmed.startsWith("~/")) return trimmed;
  const { homedir } = await import("os");
  const { join } = await import("path");
  return trimmed === "~" ? homedir() : join(homedir(), trimmed.slice(2));
}

/**
 * Start a new segment. An explicit `path` is the new working directory; with
 * none, the Bot's current directory (its latest segment's Workspace path, else
 * its remembered default) is used, and a Bot with neither asks for one.
 */
export async function startSegment(
  botId: string,
  path?: string,
  starter?: SegmentStarter,
): Promise<string | null> {
  const use = starter ?? substituted ?? productStarter();
  const bot = registry().bots.find((item) => item.id === botId);
  if (!bot) {
    setActionError("找不到这个 Bot。");
    return null;
  }
  if (bot.status !== "ready") {
    setActionError("初始化之后才能开新段。");
    return null;
  }
  let target = path === undefined ? "" : await expandHome(path);
  if (!target) {
    target = workingDirectoryOf(registry(), workspaces(), botId) || bot.defaultWorkspacePath || "";
  }
  if (!target) target = (await use.pickDirectory()) ?? "";
  if (!target) {
    setActionError("开新段前要选择工作目录。");
    return null;
  }
  try {
    const workspace = await use.workspace(target);
    const sessionId = await use.createSession(botId, workspace.id);
    await use.rememberPath(botId, target);
    return sessionId;
  } catch (error) {
    setActionError(messageOf(error));
    return null;
  }
}

/**
 * Change the Bot's working directory. A different directory starts a new
 * segment there; the same directory keeps the current segment. Returns the new
 * Session id, or null when nothing started.
 */
export async function changeWorkingDirectory(
  botId: string,
  path: string,
  starter?: SegmentStarter,
): Promise<string | null> {
  const target = await expandHome(path);
  if (!target) {
    setActionError("工作目录不能为空。");
    return null;
  }
  const current = workingDirectoryOf(registry(), workspaces(), botId);
  if (current && trimPath(current) === trimPath(target)) return null;
  return startSegment(botId, target, starter);
}

/** 「新话题」 / `/new`: the next segment in the current working directory. */
export function newTopic(botId: string, starter?: SegmentStarter): Promise<string | null> {
  return startSegment(botId, undefined, starter);
}

/** The starter's readable line for a failure. */
export function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Workspace 调用失败。";
}
