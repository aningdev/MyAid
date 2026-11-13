/**
 * Settings › Background and About read the Host's own public status: the
 * lifecycle phase (which is also dsh web's, the Host starts it), the Host's
 * release version, the dsh version it found and the one it requires, and the
 * recent reason it gave. The verbs are the control API's start / stop /
 * restart; a test injects a source so neither page needs a live Host.
 */
import { signal } from "nsh";

import { hostAccess, type HostStatus } from "../../lib/host/control";
import {
  hostLauncherStatus,
  launcherFailureText,
  type LauncherStatus,
} from "../../lib/host/launcher";
import { t, type MessageKey } from "../../lib/i18n";

export type HostFactsSource = {
  status(): Promise<HostStatus>;
  start(): Promise<HostStatus>;
  stop(): Promise<HostStatus>;
  restart(): Promise<HostStatus>;
  launcher(): LauncherStatus;
};

export type HostFacts = {
  /** `ready` once the Host answered a read, `unavailable` when none does. */
  phase: "idle" | "loading" | "ready" | "unavailable";
  reachable: boolean;
  status: HostStatus | null;
  hostVersion: string | null;
  /** The dsh version the Host requires (`supported-dsh.json`). */
  supportedDsh: string | null;
  /** The dsh version the Host's guardian found, when it has run. */
  actualDsh: string | null;
  /** Set while the actual and required dsh versions differ. */
  mismatch: string | null;
  launcher: LauncherStatus;
  errors: string[];
};

const initial: HostFacts = {
  phase: "idle",
  reachable: false,
  status: null,
  hostVersion: null,
  supportedDsh: null,
  actualDsh: null,
  mismatch: null,
  launcher: hostLauncherStatus(),
  errors: [],
};

export const hostFacts = signal<HostFacts>(initial);

let injected: HostFactsSource | undefined;

/** Tests replace the control API with a fake; `null` restores the live one. */
export function setHostFactsSource(next: HostFactsSource | null): void {
  injected = next ?? undefined;
}

function liveSource(): HostFactsSource {
  return {
    status: () => hostAccess.status(),
    start: () => hostAccess.start(),
    stop: () => hostAccess.stop(),
    restart: () => hostAccess.restart(),
    launcher: () => hostLauncherStatus(),
  };
}

/** Read the Host's status; a Host that cannot be reached leaves the page in its unavailable state. */
export async function loadHostFacts(): Promise<HostFacts> {
  const previous = hostFacts();
  hostFacts.set({ ...previous, phase: previous.phase === "ready" ? "ready" : "loading" });
  const source = injected ?? liveSource();
  const launcher = safeLauncher(source);
  try {
    const status = await source.status();
    const supported = status.version || null;
    const actual = status.dshVersion ?? null;
    const mismatch =
      actual && supported && actual !== supported
        ? t("background.mismatch", { actual, supported })
        : null;
    const next: HostFacts = {
      phase: "ready",
      reachable: true,
      status,
      hostVersion: status.hostVersion ?? null,
      supportedDsh: supported,
      actualDsh: actual,
      mismatch,
      launcher,
      errors: errorsOf(status, launcher, null),
    };
    hostFacts.set(next);
    return next;
  } catch (error) {
    const next: HostFacts = {
      ...initial,
      phase: "unavailable",
      launcher,
      errors: errorsOf(null, launcher, errorMessage(error)),
    };
    hostFacts.set(next);
    return next;
  }
}

/** Start dsh web through the Host, then re-read the facts. */
export async function startBackground(): Promise<HostFacts> {
  return command((source) => source.start());
}

/** Stop dsh web through the Host, then re-read the facts. */
export async function stopBackground(): Promise<HostFacts> {
  return command((source) => source.stop());
}

/** Restart dsh web through the Host, then re-read the facts. */
export async function restartBackground(): Promise<HostFacts> {
  return command((source) => source.restart());
}

async function command(run: (source: HostFactsSource) => Promise<HostStatus>): Promise<HostFacts> {
  const source = injected ?? liveSource();
  hostFacts.set({ ...hostFacts(), phase: "loading", errors: [] });
  try {
    await run(source);
    return await loadHostFacts();
  } catch (error) {
    const next: HostFacts = {
      ...hostFacts(),
      phase: "unavailable",
      errors: errorsOf(hostFacts().status, safeLauncher(source), errorMessage(error)),
    };
    hostFacts.set(next);
    return next;
  }
}

function safeLauncher(source: HostFactsSource): LauncherStatus {
  try {
    return source.launcher();
  } catch {
    return hostLauncherStatus();
  }
}

/** The last reasons worth showing: the Host's, the launcher's, and the last failed read. */
function errorsOf(
  status: HostStatus | null,
  launcher: LauncherStatus,
  readError: string | null,
): string[] {
  const reasons: string[] = [];
  if (readError) reasons.push(readError);
  // A stopped Host explains itself through its phase; only a failure is an error.
  if (status?.reason && status.phase === "failed") reasons.push(status.reason);
  if (launcher.failure) reasons.push(launcherFailureText(launcher.failure));
  return [...new Set(reasons.filter((reason) => reason.trim().length > 0))].slice(0, 5);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The lifecycle phases the Host reports, as words. */
const LIFECYCLE_LABELS: Record<string, MessageKey> = {
  idle: "lifecycle.idle",
  preparing: "lifecycle.preparing",
  starting: "lifecycle.starting",
  ready: "lifecycle.ready",
  stopping: "lifecycle.stopping",
  stopped: "lifecycle.stopped",
  recovering: "lifecycle.recovering",
  failed: "lifecycle.failed",
};

/** A Host / dsh web phase in the language the app shows; an unknown one stays as sent. */
export function lifecycleLabel(phase: string | null | undefined): string {
  if (!phase) return "—";
  const key = LIFECYCLE_LABELS[phase];
  return key ? t(key) : phase;
}
