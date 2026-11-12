/**
 * Host reachability for the shell: read the registry, then the Host, and
 * connect dsh when the Host answers. Web and other non-desktop runs have no
 * Host to ask, so the shell stays usable and the footer says "disconnected".
 */
import { platform } from "nsh";

import { loadRegistry, registry } from "../../features/bots/state";
import {
  connectSession,
  hostConnection,
  refreshHostStatus,
} from "../../features/dialogue/session/runtime";
import { loadAndApplyShellPrefs } from "./prefs";

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
}

export async function startShell(): Promise<void> {
  await loadRegistry();
  // The stored workbench points at registry objects: load them together.
  await loadAndApplyShellPrefs(registry());
  await retryHost();
}
