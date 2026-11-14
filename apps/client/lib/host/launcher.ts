/**
 * The Host launcher, after lorca's `desktop/launcher.go`.
 *
 * The app ships the Host beside it and starts it itself, unless one already answers on the
 * port. A Host that exits is started again after a pause that doubles from a second to fifteen
 * seconds, and the pause starts over once a Host reports ready. If the binary cannot be found or
 * started, the launcher says so and the shell shows the Host empty state with the manual
 * command. The app stops the Host it started when it quits (`stopHostOnQuit`) and leaves a Host
 * it found running alone; that one is kept by the Host's own service registration.
 */
import { join } from "path";

import { signal } from "nsh";
import { Application, isAvailable as hasWindow } from "nsh/desktop";

import { dataRootPath, hostControlAllowed } from "../data-root";
import { t } from "../i18n";
import { hostPort, probeHost } from "./client";

/** The command the empty state tells the user to run by hand. */
export const MANUAL_HOST_COMMAND = "myaid-host serve-app";

/** The binary the app starts, resolved on `PATH`; `capabilities.process.execute` names it. */
export const HOST_BINARY = "myaid-host";

export type LauncherFailure =
  | { kind: "missing_binary" }
  | { kind: "launch"; reason: string }
  | { kind: "exited"; code: number | null }
  | { kind: "startup"; reason: string };

export type LauncherPhase = "idle" | "probing" | "starting" | "running" | "failed";

export type LauncherStatus = {
  phase: LauncherPhase;
  port: number;
  /** The Host was already answering: this app started nothing. */
  external?: boolean;
  failure?: LauncherFailure;
};

/** The child a launcher spawns; a test supplies a fake one. */
export type LauncherChild = {
  onExit(handler: (code: number | null) => void): void;
  kill(): void;
};

/** Everything the launcher reaches the outside with; a test replaces what it needs. */
export type LauncherSeams = {
  port(): number;
  probe(port: number): Promise<boolean>;
  locate(): string;
  spawn(binary: string, args: string[]): LauncherChild;
  /** How long a spawned Host has to answer on the port. */
  startTimeoutMs: number;
  pollMs: number;
  restartDelayMs: number;
  maxRestartDelayMs: number;
};

export type HostLauncher = {
  status(): LauncherStatus;
  /** Probe, reuse, or start a Host: resolves once one answers or the launcher gives up. */
  ensureRunning(): Promise<LauncherStatus>;
  /** Ask again by hand, as the empty state's Retry does. */
  retry(): Promise<LauncherStatus>;
  /** Stop the child this app started; a Host that was already running is left alone. */
  stop(): void;
  /** Each status change: the shell turns "exited" into a Host-down and "running" into a probe. */
  onChange(listener: (status: LauncherStatus) => void): () => void;
};

/** The shell reads this to word the footer and the empty state. */
export const hostLauncherStatus = signal<LauncherStatus>({ phase: "idle", port: hostPort() });

/** The data root this app's Host serves: `MYAID_DATA_ROOT`, else the app's own. */
export function hostDataRoot(): string {
  const raw = typeof process !== "undefined" && process.env ? process.env.MYAID_DATA_ROOT : "";
  return raw && raw.trim() ? raw.trim() : dataRootPath();
}

/** Where the Host writes its log, for the empty state to name. */
export function hostLogPath(): string {
  return join(hostDataRoot(), "logs");
}

const realSeams: LauncherSeams = {
  port: hostPort,
  probe: (port) => probeHost(port),
  locate: () => HOST_BINARY,
  spawn: (binary, args) => {
    const child = process.spawn(binary, args, { lines: true });
    // The Host's own log has nowhere else to go: the terminal while a developer watches, and
    // the empty state's reason names the file when the service runs it instead.
    child.on("stderr", (line: string) => console.warn(`[host] ${line}`));
    child.on("stdout", (line: string) => console.log(`[host] ${line}`));
    return {
      onExit: (handler) => {
        child.on("exit", (result) => handler(result?.code ?? null));
      },
      kill: () => child.kill(),
    };
  },
  startTimeoutMs: 30_000,
  pollMs: 100,
  restartDelayMs: 1_000,
  maxRestartDelayMs: 15_000,
};

function failureOf(error: unknown): LauncherFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT|not found|could not load/i.test(message)) return { kind: "missing_binary" };
  return { kind: "launch", reason: message };
}

export function createHostLauncher(overrides: Partial<LauncherSeams> = {}): HostLauncher {
  const seams: LauncherSeams = { ...realSeams, ...overrides };
  let status: LauncherStatus = { phase: "idle", port: seams.port() };
  let child: LauncherChild | null = null;
  let ready = false;
  let stopped = false;
  let probing = false;
  let generation = 0;
  let restartDelay = seams.restartDelayMs;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(status: LauncherStatus) => void>();

  const publish = (next: LauncherStatus): LauncherStatus => {
    status = next;
    hostLauncherStatus.set(next);
    for (const listener of listeners) {
      try {
        listener(next);
      } catch {
        // A listener that throws is not the launcher's failure.
      }
    }
    return next;
  };

  const delay = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  function exited(at: number, code: number | null): void {
    if (stopped || at !== generation) return;
    child = null;
    ready = false;
    publish({ phase: "failed", port: seams.port(), failure: { kind: "exited", code } });
    const wait = restartDelay;
    restartDelay = Math.min(restartDelay * 2, seams.maxRestartDelayMs);
    timer = setTimeout(() => {
      timer = null;
      void ensureRunning();
    }, wait);
  }

  async function waitReady(at: number, port: number): Promise<void> {
    const deadline = Date.now() + seams.startTimeoutMs;
    while (!stopped && at === generation && !ready && child) {
      if (await seams.probe(port)) {
        if (stopped || at !== generation) return;
        ready = true;
        restartDelay = seams.restartDelayMs;
        publish({ phase: "running", port });
        return;
      }
      if (Date.now() >= deadline) {
        if (stopped || at !== generation || ready) return;
        const timedOut = child;
        child = null;
        timedOut?.kill();
        publish({
          phase: "failed",
          port,
          failure: {
            kind: "startup",
            reason: t("launcher.timeout", {
              seconds: Math.round(seams.startTimeoutMs / 1000),
              port,
            }),
          },
        });
        return;
      }
      await delay(seams.pollMs);
    }
  }

  function spawn(at: number, port: number): LauncherStatus {
    publish({ phase: "starting", port });
    let handle: LauncherChild;
    try {
      handle = seams.spawn(seams.locate(), ["serve-app", "--port", String(port)]);
    } catch (error) {
      return publish({ phase: "failed", port, failure: failureOf(error) });
    }
    child = handle;
    ready = false;
    handle.onExit((code) => exited(at, code));
    void waitReady(at, port);
    return status;
  }

  async function ensureRunning(): Promise<LauncherStatus> {
    if (stopped) return status;
    // A test app starts nothing: the real port may be the person's own Host, and `myaid-host`
    // may be on PATH. It keeps the idle status, so the footer says the neutral "Host
    // disconnected" rather than a failure it never looked for (`lib/data-root.ts`).
    if (!hostControlAllowed()) return status;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    // Already ours: a running Host is reported as it stands, without a second publish (which
    // would tell the shell to probe again, and that call comes back here).
    if (child) return status;
    if (probing) return status;
    const port = seams.port();
    probing = true;
    const at = ++generation;
    publish({ phase: "probing", port });
    const answered = await seams.probe(port);
    probing = false;
    if (stopped || at !== generation) return status;
    if (answered) {
      restartDelay = seams.restartDelayMs;
      return publish({ phase: "running", port, external: true });
    }
    return spawn(at, port);
  }

  return {
    status: () => status,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ensureRunning,
    retry: ensureRunning,
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      child?.kill();
      child = null;
      ready = false;
    },
  };
}

let launcher: HostLauncher | null = null;

/** The one launcher this app runs; the shell asks it at start and on Retry. */
export function hostLauncher(): HostLauncher {
  launcher ??= createHostLauncher();
  return launcher;
}

/** Start (or find) the Host. Web and other non-desktop runs never spawn one. */
export async function ensureHostRunning(): Promise<LauncherStatus> {
  return hostLauncher().ensureRunning();
}

/**
 * How the app learns it is quitting: `Application.on("quit")` where the platform has an app
 * lifecycle. A test passes its own subscription.
 */
export type QuitSubscription = (listener: () => void) => void;

const applicationQuit: QuitSubscription = (listener) => {
  if (!hasWindow) return;
  try {
    Application.on("quit", listener);
  } catch (error) {
    // A host without an app lifecycle has nothing to quit; `scripts/dev.mjs` then owns
    // stopping the Host this run started.
    console.warn(`[host] quit hook unavailable: ${String(error)}`);
  }
};

/**
 * Stop the Host this app started when the app quits — its Quit item, the last window closing,
 * the system ending it. A Host that was already running is not this app's to stop.
 * @param subscribe - where the quit notification comes from.
 * @param launcher - the one launcher this app runs.
 */
export function stopHostOnQuit(
  subscribe: QuitSubscription = applicationQuit,
  launcher: HostLauncher = hostLauncher(),
): void {
  subscribe(() => launcher.stop());
}

/** The empty state's Retry: ask the one launcher again. */
export async function retryHostLauncher(): Promise<LauncherStatus> {
  return hostLauncher().retry();
}

/** What the empty state says, in words, for a failure. */
export function launcherFailureText(failure: LauncherFailure | undefined): string {
  switch (failure?.kind) {
    case "missing_binary":
      return t("launcher.missingBinary", { binary: HOST_BINARY });
    case "launch":
      return t("launcher.launchFailed", { reason: failure.reason });
    case "exited":
      return t("launcher.exited", { code: failure.code ?? t("launcher.signal") });
    case "startup":
      return failure.reason;
    default:
      return t("launcher.notRunning");
  }
}
