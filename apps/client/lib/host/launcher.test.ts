/**
 * The Host launcher, after lorca's launcher: a Host that already answers is reused and nothing
 * is spawned; a spawned Host's exit is followed by another start after a pause; a binary that
 * cannot be found or started is the empty state's reason; quitting the app stops the Host it
 * started and only that one. Every child here is a fake.
 */
import { expect, test } from "nsh/test";

import {
  createHostLauncher,
  type LauncherChild,
  type LauncherStatus,
  stopHostOnQuit,
} from "./launcher";

type FakeChild = LauncherChild & {
  args: string[];
  binary: string;
  killed: boolean;
  exit(code: number | null): void;
};

function fakeSpawner() {
  const children: FakeChild[] = [];
  const exits = new Map<FakeChild, (code: number | null) => void>();
  const spawn = (binary: string, args: string[]): LauncherChild => {
    const child: FakeChild = {
      binary,
      args,
      killed: false,
      onExit: (handler) => {
        exits.set(child, handler);
      },
      kill: () => {
        child.killed = true;
      },
      exit: (code) => {
        exits.get(child)?.(code);
      },
    };
    children.push(child);
    return child;
  };
  return { children, spawn };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitFor(
  what: string,
  ready: (status: LauncherStatus) => boolean,
  launcher: { status(): LauncherStatus },
): Promise<LauncherStatus> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (ready(launcher.status())) return launcher.status();
    await delay(5);
  }
  throw new Error(`timed out waiting for ${what}: ${JSON.stringify(launcher.status())}`);
}

test("a Host that already answers is reused and nothing is spawned", async () => {
  const spawner = fakeSpawner();
  const launcher = createHostLauncher({
    port: () => 4873,
    probe: async () => true,
    locate: () => "dsh-bot-host",
    spawn: spawner.spawn,
    startTimeoutMs: 200,
    pollMs: 5,
    restartDelayMs: 10,
    maxRestartDelayMs: 40,
  });
  const status = await launcher.ensureRunning();
  expect(status.phase).toBe("running");
  expect(status.external).toBe(true);
  expect(spawner.children.length).toBe(0);
  launcher.stop();
});

test("a Host is started when none answers, and its binary and arguments are the launcher's", async () => {
  const spawner = fakeSpawner();
  let answering = false;
  const launcher = createHostLauncher({
    port: () => 4873,
    probe: async () => answering,
    locate: () => "dsh-bot-host",
    spawn: spawner.spawn,
    startTimeoutMs: 200,
    pollMs: 5,
    restartDelayMs: 10,
    maxRestartDelayMs: 40,
  });
  const started = await launcher.ensureRunning();
  expect(started.phase).toBe("starting");
  expect(spawner.children.length).toBe(1);
  expect(spawner.children[0]?.binary).toBe("dsh-bot-host");
  expect(spawner.children[0]?.args).toEqual(["serve-app", "--port", "4873"]);
  answering = true;
  const running = await waitFor("running", (status) => status.phase === "running", launcher);
  expect(running.external).toBeUndefined();
  launcher.stop();
  expect(spawner.children[0]?.killed).toBe(true);
});

test("a Host that exits is started again after the pause", async () => {
  const spawner = fakeSpawner();
  let answering = false;
  const launcher = createHostLauncher({
    port: () => 4873,
    probe: async () => answering,
    locate: () => "dsh-bot-host",
    spawn: spawner.spawn,
    startTimeoutMs: 200,
    pollMs: 5,
    restartDelayMs: 10,
    maxRestartDelayMs: 40,
  });
  await launcher.ensureRunning();
  spawner.children[0]?.exit(3);
  const failed = await waitFor("failed", (status) => status.phase === "failed", launcher);
  expect(failed.failure).toEqual({ kind: "exited", code: 3 });
  await waitFor("a second child", () => spawner.children.length === 2, launcher);
  expect(spawner.children[1]?.args).toEqual(["serve-app", "--port", "4873"]);
  launcher.stop();
});

test("a binary that cannot be started is the empty state's reason", async () => {
  const launcher = createHostLauncher({
    port: () => 4873,
    probe: async () => false,
    locate: () => "dsh-bot-host",
    spawn: () => {
      throw new Error("ENOENT: dsh-bot-host");
    },
    startTimeoutMs: 200,
    pollMs: 5,
    restartDelayMs: 10,
    maxRestartDelayMs: 40,
  });
  const status = await launcher.ensureRunning();
  expect(status.phase).toBe("failed");
  expect(status.failure).toEqual({ kind: "missing_binary" });
  launcher.stop();
});

test("a Host that never answers is stopped and reported as a startup failure", async () => {
  const spawner = fakeSpawner();
  const launcher = createHostLauncher({
    port: () => 4873,
    probe: async () => false,
    locate: () => "dsh-bot-host",
    spawn: spawner.spawn,
    startTimeoutMs: 50,
    pollMs: 5,
    restartDelayMs: 10,
    maxRestartDelayMs: 40,
  });
  await launcher.ensureRunning();
  const failed = await waitFor("startup failure", (status) => status.phase === "failed", launcher);
  expect(failed.failure?.kind).toBe("startup");
  expect(spawner.children[0]?.killed).toBe(true);
  launcher.stop();
});

test("a stopped launcher starts nothing more", async () => {
  const spawner = fakeSpawner();
  let answering = false;
  const launcher = createHostLauncher({
    port: () => 4873,
    probe: async () => answering,
    locate: () => "dsh-bot-host",
    spawn: spawner.spawn,
    startTimeoutMs: 200,
    pollMs: 5,
    restartDelayMs: 10,
    maxRestartDelayMs: 40,
  });
  await launcher.ensureRunning();
  launcher.stop();
  spawner.children[0]?.exit(1);
  await delay(30);
  expect(spawner.children.length).toBe(1);
  answering = true;
  // It keeps the status it had when it stopped, and starts nothing again.
  expect((await launcher.ensureRunning()).phase).toBe("starting");
  expect(spawner.children.length).toBe(1);
});

test("quitting the app stops the Host it started", async () => {
  const spawner = fakeSpawner();
  let answering = false;
  const launcher = createHostLauncher({
    port: () => 4873,
    probe: async () => answering,
    locate: () => "dsh-bot-host",
    spawn: spawner.spawn,
    startTimeoutMs: 200,
    pollMs: 5,
    restartDelayMs: 10,
    maxRestartDelayMs: 40,
  });
  const listeners: (() => void)[] = [];
  stopHostOnQuit((listener) => listeners.push(listener), launcher);
  await launcher.ensureRunning();
  answering = true;
  await waitFor("running", (status) => status.phase === "running", launcher);
  // Registering the hook stops nothing: the Host is running, not quitting.
  expect(spawner.children[0]?.killed).toBe(false);
  for (const listener of listeners) listener();
  expect(spawner.children[0]?.killed).toBe(true);
});

test("a Host the app found running is not this app's to stop", async () => {
  const spawner = fakeSpawner();
  const launcher = createHostLauncher({
    port: () => 4873,
    probe: async () => true,
    locate: () => "dsh-bot-host",
    spawn: spawner.spawn,
    startTimeoutMs: 200,
    pollMs: 5,
    restartDelayMs: 10,
    maxRestartDelayMs: 40,
  });
  const listeners: (() => void)[] = [];
  stopHostOnQuit((listener) => listeners.push(listener), launcher);
  await launcher.ensureRunning();
  for (const listener of listeners) listener();
  expect(spawner.children.length).toBe(0);
  expect(launcher.status().external).toBe(true);
});
