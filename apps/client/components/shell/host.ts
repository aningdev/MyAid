/**
 * Host reachability for the shell: read the registry, then the Host, and
 * connect dsh when the Host answers. Web and other non-desktop runs have no
 * Host to ask, so the shell stays usable and the footer says "disconnected".
 *
 * A v3 / v4 registry is read-only until this happens: its Dialogues own
 * paths that dsh must take over, so the migration waits for the one Host that
 * can own them (see `features/workspace/migrate`).
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
  refreshHostStatus,
} from "../../features/dialogue/session/runtime";
import { migrateRegistry } from "../../features/workspace/migrate";
import {
  archiveSession,
  loadStoredWorkspaces,
  openWorkspace,
  pinSession,
  renameWorkspace,
  whenWorkspacesReady,
  workspaces,
} from "../../features/workspace/state";
import { applyShellPrefs, legacySessionPins, loadShellPrefs, markPrefsLoaded } from "./prefs";

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

/** The footer's retry, and the shell's start once the registry is read. */
export async function retryHost(): Promise<void> {
  await refreshHost();
  await connectWhenHosted();
  // A v4 file becomes v5 as soon as a Host can own its Workspaces.
  if (legacyRegistry() && hostConnection() === "up") await migrateLegacy();
}

export async function startShell(): Promise<void> {
  await loadRegistry();
  // Stored Favorites still name v4 Sessions; the migration moves those pins.
  const prefs = await loadShellPrefs();
  await retryHost();
  // A Host-less test app reads the baseline a fixture put in its Storage.
  await loadStoredWorkspaces();
  // A v4 file that could not migrate yet keeps the notice; nothing else shows.
  if (legacyRegistry()) return;
  applyShellPrefs(prefs, registry(), workspaces());
  markPrefsLoaded();
}

/** The one migration in flight; the shell's start and the footer's retry share it. */
let migrating: Promise<void> | undefined;

/**
 * Move a v4 registry's paths, names and archives into dsh, then store v5.
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
    await whenWorkspacesReady();
    const prefs = await loadShellPrefs();
    const { registry: next, report } = await migrateRegistry(
      legacy,
      {
        async create(path) {
          const workspace = await openWorkspace(connection, path);
          return { workspaceId: workspace.id, title: workspace.title };
        },
        rename: async (workspaceId, title) => {
          await renameWorkspace(connection, workspaceId, title);
        },
        archiveSession: (sessionId) => archiveSession(connection, sessionId),
        pinSession: (sessionId) => pinSession(connection, sessionId),
        archived: () => workspaces().archived,
        pinned: () => workspaces().pinned,
        ready: () => whenWorkspacesReady(),
      },
      legacySessionPins(prefs),
    );
    if (await acceptMigratedRegistry(next)) {
      applyShellPrefs(prefs, registry(), workspaces());
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
