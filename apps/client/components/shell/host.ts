/**
 * Host reachability for the shell: read the registry, then the Host, and
 * connect dsh when the Host answers. Web and other non-desktop runs have no
 * Host to ask, so the shell stays usable and the footer says "disconnected".
 *
 * A v3 / v4 / v5 registry is read-only until this happens: its Dialogues own
 * the Bot's conversation, which dsh must take over as one long conversation,
 * so the migration waits for the one Host that can own it (see
 * `features/workspace/migrate`).
 */
import { platform } from "nsh";

import {
  acceptMigratedRegistry,
  legacyRegistry,
  loadRegistry,
  migrationNotice,
  registry,
} from "../../features/bots/state";
import {
  connectSession,
  hostConnection,
  noteHostLost,
  refreshHostStatus,
} from "../../features/dialogue/session/runtime";
import { migrateRegistry } from "../../features/workspace/migrate";
import {
  loadStoredWorkspaces,
  openWorkspace,
  pinSession,
  renameWorkspace,
  unarchiveSession,
  whenWorkspacesReady,
  workspaces,
} from "../../features/workspace/state";
import { ensureHostRunning, hostLauncher, retryHostLauncher } from "../../lib/host/launcher";
import { applyShellPrefs, loadShellPrefs, markPrefsLoaded } from "./prefs";

/** A Host runs only beside the desktop app (the web target has none). */
export const hasHost = platform.idiom === "desktop" && platform.os !== "web";

/** Re-probe the Host; leaves `hostConnection` down when it does not answer. */
export async function refreshHost(): Promise<void> {
  if (!hasHost) return;
  try {
    await refreshHostStatus();
  } catch {
    // The footer reads `hostConnection`; a failing probe leaves it down.
  }
}

/** Connect dsh when the Host is up (the registry and approvals follow). */
export async function connectWhenHosted(): Promise<void> {
  if (!hasHost || hostConnection() !== "up") return;
  try {
    await connectSession();
  } catch {
    // Panels that need dsh show the reason in their own error lines.
  }
}

/**
 * Start the Host this app ships, or find one already answering (`lib/host/launcher`). Web and
 * other non-desktop runs have none, and a failure is left for the footer to word.
 */
export async function startHost(): Promise<void> {
  if (!hasHost) return;
  try {
    await ensureHostRunning();
  } catch {
    // The footer reads the launcher's status and offers the manual command.
  }
}

/**
 * Follow the launcher: a Host that exits takes the Client's connection with it, and the Host the
 * launcher starts again is probed at once. Wired once, by `startShell`.
 */
let following: boolean | undefined;
export function watchHostLauncher(): void {
  if (!hasHost || following) return;
  following = true;
  let last: string | undefined;
  hostLauncher().onChange((status) => {
    // Only a change of phase is news: a repeated publish must not start another probe.
    if (status.phase === last) return;
    last = status.phase;
    if (status.phase === "failed") {
      noteHostLost(
        status.failure?.kind === "exited"
          ? "Host 已退出，正在重新启动。"
          : "Host 未运行，正在等待启动。",
      );
      return;
    }
    if (status.phase === "running") void retryHost();
  });
}

/** The footer's retry: ask the launcher again, then the Host. */
export async function retryHost(): Promise<void> {
  if (hasHost) {
    try {
      await retryHostLauncher();
    } catch {
      // A launch that throws is a launcher status, not a shell error.
    }
  }
  await refreshHost();
  await connectWhenHosted();
  // An old file becomes v6 as soon as a Host can own its Workspaces and segments.
  if (legacyRegistry() && hostConnection() === "up") await migrateLegacy();
}

export async function startShell(): Promise<void> {
  await loadRegistry();
  const prefs = await loadShellPrefs();
  // Nothing else in the app starts the Host: do it before the first probe.
  watchHostLauncher();
  await startHost();
  await retryHost();
  // A Host-less test app reads the baseline a fixture put in its Storage.
  await loadStoredWorkspaces();
  // An old file that could not migrate yet keeps the notice; nothing else shows.
  if (legacyRegistry()) return;
  applyShellPrefs(prefs, registry());
  markPrefsLoaded();
}

/** The one migration in flight; the shell's start and the footer's retry share it. */
let migrating: Promise<void> | undefined;

/**
 * Move an old registry's paths, names and archived Sessions into dsh, then
 * store the Bot's one long conversation (v6).
 * Every step is idempotent, so a retry after a failure starts over safely;
 * two callers never run it at once.
 */
function migrateLegacy(): Promise<void> {
  if (!legacyRegistry()) return Promise.resolve();
  if (migrating) return migrating;
  migrating = runMigration().finally(() => {
    migrating = undefined;
  });
  return migrating;
}

async function runMigration(): Promise<void> {
  const legacy = legacyRegistry();
  if (!legacy) return;
  try {
    const { ensureConnected } = await import("../../lib/dsh/session");
    const connection = await ensureConnected();
    const model = connection.workspaces;
    await whenWorkspacesReady();
    const prefs = await loadShellPrefs();
    const { registry: next, report } = await migrateRegistry(
      legacy,
      {
        async create(path) {
          const workspace = await openWorkspace(model, path);
          return { workspaceId: workspace.id, title: workspace.title };
        },
        rename: async (workspaceId, title) => {
          await renameWorkspace(model, workspaceId, title);
        },
        unarchiveSession: (sessionId) => unarchiveSession(model, sessionId),
        pinSession: (sessionId) => pinSession(model, sessionId),
        archived: () => workspaces().archived,
        pinned: () => workspaces().pinned,
        ready: () => whenWorkspacesReady(),
      },
      // A v4 Session pin was a place of its own; a Bot's conversation has
      // segments now, so the migration pins nothing (the pins are dropped).
      [],
    );
    if (await acceptMigratedRegistry(next)) {
      applyShellPrefs(prefs, registry());
      markPrefsLoaded();
      if (report.skipped > 0) {
        migrationNotice.set(
          `迁移完成；${report.skipped} 项 dsh 没有接受（名字可能重名，或旧 Session 已不存在）。`,
        );
      }
    }
  } catch (error) {
    migrationNotice.set(
      `迁移中断：${error instanceof Error ? error.message : String(error)}；连接 Host 后会重试。`,
    );
  }
}
