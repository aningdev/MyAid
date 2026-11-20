/**
 * Host reachability for the shell: connect dsh when the Host answers, and the
 * Registry follows that connection. Web and other non-desktop runs have no
 * Host to ask, so the shell stays usable and the footer says "disconnected".
 * A Host-less test reads its Registry from the in-memory `bots` double.
 */
import { platform } from "nsh";

import { onRegistryReady, openTestBots, ready, registry } from "../../features/bots/state";
import {
  connectSession,
  hostConnection,
  noteHostLost,
  refreshHostStatus,
} from "../../features/dialogue/session/runtime";
import { loadStoredWorkspaces } from "../../features/workspace/state";
import { hostControlAllowed, usesTestStorage } from "../../lib/data-root";
import {
  ensureHostRunning,
  hostLauncher,
  retryHostLauncher,
  stopHostOnQuit,
} from "../../lib/host/launcher";
import { t } from "../../lib/i18n";
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
        status.failure?.kind === "exited" ? t("host.exitedNotice") : t("host.waitingNotice"),
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
}

export async function startShell(): Promise<void> {
  const prefs = await loadShellPrefs();
  let applied = false;
  const apply = (): void => {
    if (applied || !ready()) return;
    applied = true;
    applyShellPrefs(prefs, registry());
    markPrefsLoaded();
  };
  // A snapshot can arrive from the test double or from the Host connection.
  onRegistryReady(apply);
  // Nothing else in the app starts the Host: do it before the first probe.
  watchHostLauncher();
  // Quitting takes the Host this app started with it, so the next run launches
  // the binary it just built instead of adopting an old one.
  stopHostOnQuit();
  // A real-Host smoke talks to the plugin. Every other test app uses the
  // in-memory Remote, seeded from the fixture in its Storage.
  if (usesTestStorage() && !hostControlAllowed()) await openTestBots();
  await startHost();
  await retryHost();
  // A Host-less test app reads the Workspace baseline a fixture put in its Storage.
  await loadStoredWorkspaces();
  apply();
}
