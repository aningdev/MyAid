/**
 * The one dev entry: verify the workspace, then start one NSH target.
 *
 * `bun run dev` starts the desktop app; `bun run dev <target>` starts the target
 * named on the command line. Only desktop targets get a Host: the app starts it
 * itself (`lib/host/launcher`), so those targets need `dsh-bot-host` on PATH and
 * the Bot preset plugin overlay (`DSH_BOT_PATCH`). `web`, `mobile`, `ios` and
 * `android` do not run a local Host, so they get neither.
 *
 * Before starting, the launcher makes the tree match what the repository says:
 * `node_modules` is reinstalled when the catalog's `@deepseek-ai/*` pins, the
 * lockfile or a manifest moved on, and `dsh-bot-host` is rebuilt when it is older
 * than its sources or `apps/host/supported-dsh.json`. That is what turns a stale
 * checkout into a run of the version this branch pins, instead of silently
 * running last week's build.
 *
 * The app stops the Host it started when it quits (see `lib/host/launcher`). A
 * run that was killed before the app could quit still leaves one behind, so a
 * Host on the port that this checkout's `target/debug` started before the binary
 * was rebuilt is stopped here; a Host from anywhere else is only reported, with
 * the command that stops it.
 *
 * `--isolated[=<name>]` runs against `~/.dsh-bot-dev/<name>` (default `default`)
 * instead of the real `~/.dsh-bot`: the app's registry, prefs and Host token and
 * the Host it starts all use that root (`DSH_BOT_HOME`), on port 4873 unless
 * `DSH_BOT_HOST_PORT` names another, so it never reaches the person's own Host.
 * Agents and scripted checks always use it.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { installedDrift, manifests, root } from "./dsh-pin.mjs";

/** Targets the app can start, and whether they run a local Host. */
const TARGETS = {
  macos: { script: "dev:macos", host: true },
  windows: { script: "dev:windows", host: true },
  linux: { script: "dev:linux", host: true },
  gpui: { script: "dev:gpui", host: true },
  web: { script: "dev:web", host: false },
  mobile: { script: "dev:mobile", host: false },
  ios: { script: "dev:ios", host: false },
  android: { script: "dev:android", host: false },
};

/** What `bun run dev` starts when no target is named. */
const DESKTOP = { name: "desktop", script: "dev", host: true };

/** The binary the app looks up on PATH, and where cargo puts it. */
const HOST_BIN = join(
  root,
  "target",
  "debug",
  process.platform === "win32" ? "dsh-bot-host.exe" : "dsh-bot-host",
);

/** Port an isolated run's Host uses when `DSH_BOT_HOST_PORT` names none. */
const ISOLATED_PORT = 4873;

/**
 * Apply `--isolated[=<name>]` to this process's environment before anything
 * reads it, so the Host sweep, the app and the Host it starts agree on the root.
 * @param argv - command-line arguments after the script name.
 * @returns the arguments without the flag.
 */
function applyIsolation(argv) {
  const flag = argv.find(
    (argument) => argument === "--isolated" || argument.startsWith("--isolated="),
  );
  if (flag === undefined) return argv;
  const name = flag.includes("=") ? flag.slice(flag.indexOf("=") + 1) : "default";
  if (!/^[\w.-]+$/.test(name) || name === "." || name === "..") {
    console.error(`--isolated 的名字只能用字母、数字、. _ -：${name}`);
    process.exit(1);
  }
  const dataRoot = join(homedir(), ".dsh-bot-dev", name);
  mkdirSync(dataRoot, { recursive: true });
  process.env.DSH_BOT_HOME = dataRoot;
  process.env.DSH_BOT_HOST_PORT ||= String(ISOLATED_PORT);
  console.log(`隔离运行：数据根 ${dataRoot}，Host 端口 ${process.env.DSH_BOT_HOST_PORT}`);
  return argv.filter((argument) => argument !== flag);
}

const args = applyIsolation(process.argv.slice(2));

/** The port the app's Host listens on (`apps/client/lib/host/client.ts` honours the same one). */
const HOST_PORT = Number(process.env.DSH_BOT_HOST_PORT ?? "") || 4872;

/** Directories and files a Host build depends on. */
const HOST_INPUTS = ["Cargo.toml", "Cargo.lock", "apps/host", "crates"];

/** File types in those directories that can change the binary. */
const HOST_INPUT_TYPES = [".rs", ".toml", ".json", ".lock"];

/** Dev-only overlay the app passes to the Host; gitignored and removed on exit. */
const DEV_DIR = join(root, ".dev");

/** Marks the install result the freshness step last accepted. */
const INSTALL_STAMP = join(root, "node_modules", ".dsh-bot-install-stamp.json");

const delimiter = process.platform === "win32" ? ";" : ":";
/** @type {import('node:child_process').ChildProcess | undefined} */
let child;
let stopping = false;

/**
 * Run a command to completion, inheriting stdio.
 * @param program - executable to run.
 * @param args - its arguments.
 */
function run(program, args) {
  return spawn(program, args, { cwd: root, stdio: "inherit" });
}

/**
 * Wait for a child and fail loudly when it does.
 * @param spawned - spawned child.
 * @param failure - message to raise on a non-zero exit; omit to accept any code.
 * @returns the child's exit code.
 */
function completed(spawned, failure) {
  return new Promise((resolveExit) => {
    spawned.once("error", (error) => {
      console.error(error.message);
      resolveExit(1);
    });
    spawned.once("exit", (code) => resolveExit(code ?? 1));
  }).then((code) => {
    if (code !== 0 && failure !== undefined) throw new Error(failure);
    return code;
  });
}

/**
 * Modification time of a path.
 * @param path - file or directory.
 * @returns milliseconds since the epoch, or 0 when missing.
 */
function mtime(path) {
  return existsSync(path) ? statSync(path).mtimeMs : 0;
}

/**
 * Newest input of an install: the lockfile and every workspace manifest.
 * @returns milliseconds since the epoch.
 */
function installInputs() {
  return Math.max(mtime(join(root, "bun.lock")), ...manifests().map(({ path }) => mtime(path)));
}

/**
 * The install result the last freshness step accepted.
 * @returns its recorded input time, or null when there is no stamp.
 */
function installStamp() {
  if (!existsSync(INSTALL_STAMP)) return null;
  try {
    return JSON.parse(readFileSync(INSTALL_STAMP, "utf8")).inputs ?? null;
  } catch {
    return null;
  }
}

/**
 * Why `node_modules` cannot be trusted as it stands.
 * @returns one reason per disagreeing fact; empty when it is fresh.
 */
function installReasons() {
  if (!existsSync(join(root, "node_modules"))) return ["node_modules 不存在"];
  const reasons = [];
  const drift = installedDrift();
  if (drift.length > 0) {
    const names = drift.map(({ name, want, got }) => `${name}@${got ?? "缺失"}≠${want}`);
    reasons.push(`已安装的 dsh 包与 catalog 不一致（${names.join("，")}）`);
  }
  const stamp = installStamp();
  if (stamp === null) reasons.push("没有安装戳记");
  else if (stamp < installInputs())
    reasons.push("bun.lock 或 workspace 的 package.json 比安装结果新");
  return reasons;
}

/**
 * Reinstall, repairing any package that drifted away from the catalog first.
 *
 * Bun keeps a package it believes it already installed, so a package whose
 * contents were replaced behind its back has to go before `bun install` can put
 * the published one back.
 */
async function ensureInstalled() {
  const reasons = installReasons();
  if (reasons.length === 0) return;
  console.log(`依赖需要更新（${reasons.join("；")}），正在 bun install …`);
  for (const { name } of installedDrift()) {
    rmSync(join(root, "node_modules", name), { recursive: true, force: true });
  }
  await completed(run("bun", ["install"]), "bun install 失败");
  const left = installedDrift();
  if (left.length > 0) {
    const names = left.map(({ name, want, got }) => `${name}@${got ?? "缺失"}≠${want}`).join("，");
    throw new Error(
      `bun install 之后仍有 dsh 包与 catalog 不一致（${names}）。` +
        "删除 node_modules 再 bun install 可强制解包。",
    );
  }
  writeFileSync(INSTALL_STAMP, `${JSON.stringify({ inputs: installInputs() }, null, 2)}\n`);
}

/**
 * Newest Host source file, and when it changed.
 * @returns the file and its modification time.
 */
function newestHostInput() {
  let newest = { path: join(root, "Cargo.toml"), time: mtime(join(root, "Cargo.toml")) };
  const walk = (path) => {
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        walk(child);
        continue;
      }
      if (!HOST_INPUT_TYPES.some((type) => entry.name.endsWith(type))) continue;
      const time = mtime(child);
      if (time > newest.time) newest = { path: child, time };
    }
  };
  for (const input of HOST_INPUTS) {
    const path = join(root, input);
    if (!existsSync(path)) continue;
    if (statSync(path).isDirectory()) walk(path);
  }
  return newest;
}

/**
 * Why `dsh-bot-host` has to be rebuilt.
 * @returns the reason, or null when the binary is up to date.
 */
function hostStaleness() {
  if (!existsSync(HOST_BIN)) return "dsh-bot-host 还没有构建";
  const newest = newestHostInput();
  if (newest.time > mtime(HOST_BIN)) return `${relative(root, newest.path)} 比 dsh-bot-host 新`;
  return null;
}

/**
 * Build the Host the app launches.
 */
async function ensureHost() {
  const stale = hostStaleness();
  if (stale !== null) {
    console.log(`重建 Host（${stale}）…`);
    await completed(run("cargo", ["build", "-p", "dsh-bot-host"]), "构建 dsh-bot-host 失败");
  }
  console.log("Host 已构建；客户端会自己启动它。");
  // A Host still answering on the port must be the one just built (or not ours
  // to touch): the app reuses whatever it finds there.
  await sweepStaleHost();
}

/**
 * Run a program and read its stdout.
 * @param program - executable to run.
 * @param args - its arguments.
 * @returns its standard output, or null when it fails (`lsof` does when nothing listens).
 */
function readOutput(program, args) {
  try {
    return execFileSync(program, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // The program is absent (Windows has no `lsof`) or found nothing: both read
    // as "this run cannot see a Host", never as a Host to stop.
    return null;
  }
}

/**
 * Processes listening on a TCP port.
 * @param port - the port the Host binds.
 * @returns their pids; empty when nothing listens or nothing can tell.
 */
function listeningPids(port) {
  const output = readOutput("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"]);
  if (output === null) return [];
  return output
    .split("\n")
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/**
 * The executable a running process was started from.
 * @param pid - the process.
 * @returns its path, or null when it cannot be read.
 */
function executableOf(pid) {
  const output = readOutput("lsof", ["-a", "-p", String(pid), "-d", "txt", "-Fn"]);
  const line = output?.split("\n").find((text) => text.startsWith("n/"));
  return line === undefined ? null : line.slice(1);
}

/**
 * When a process started.
 * @param pid - the process.
 * @returns milliseconds since the epoch, or null when it cannot be read.
 */
function startedAt(pid) {
  const output = readOutput("ps", ["-p", String(pid), "-o", "lstart="]);
  const time = output === null ? Number.NaN : Date.parse(output.trim());
  return Number.isNaN(time) ? null : time;
}

/**
 * Whether a binary path is this checkout's `target/debug` one.
 * @param path - candidate executable.
 * @returns true when both resolve to the same file.
 */
function isThisHostBinary(path) {
  if (path === null) return false;
  try {
    return realpathSync(path) === realpathSync(HOST_BIN);
  } catch {
    return false;
  }
}

/**
 * Wait until no process listens on a port.
 * @param port - the port.
 * @param timeoutMs - how long to wait for the stopped Host to let go.
 * @returns true when the port is free.
 */
async function waitForPortFree(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (listeningPids(port).length === 0) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  return listeningPids(port).length === 0;
}

/**
 * Make sure the Host on the port is the binary this run just built.
 *
 * The app stops the Host it started when it quits, so a Host left on the port
 * means the last run ended before the app could. Only one this checkout's
 * `target/debug` started before that binary was rebuilt is stopped; a Host from
 * anywhere else (an installed app, the person's own) is reported and left alone.
 */
async function sweepStaleHost() {
  const pids = listeningPids(HOST_PORT);
  for (const pid of pids) {
    const executable = executableOf(pid);
    if (!isThisHostBinary(executable)) {
      console.log(
        `端口 ${HOST_PORT} 上有一个不是本仓库 target/debug 构建的 Host（pid ${pid}，` +
          `${executable ?? "可执行文件未知"}），不动它；要停止：kill ${pid}`,
      );
      continue;
    }
    const started = startedAt(pid);
    if (started !== null && mtime(HOST_BIN) <= started) {
      console.log(
        `端口 ${HOST_PORT} 上已是本次构建的 Host（pid ${pid}），复用；要停止：kill ${pid}`,
      );
      continue;
    }
    console.log(
      `端口 ${HOST_PORT} 上的 Host（pid ${pid}）比刚构建的 dsh-bot-host 旧，先停掉它，` +
        "让 App 启动新的那个。",
    );
    process.kill(pid, "SIGTERM");
    if (!(await waitForPortFree(HOST_PORT))) {
      throw new Error(
        `端口 ${HOST_PORT} 仍被 pid ${pid} 占用；手工停止：kill ${pid}，再重跑 bun run dev。`,
      );
    }
  }
}

/**
 * Build the workspace plugins and point the app at them through an overlay patch.
 * @returns the patch file inside the worktree.
 */
async function prepareOverlay() {
  const plugins = ["bots", "tickets"];
  for (const plugin of plugins) {
    await completed(
      run("bun", ["x", "vp", "run", `dsh-${plugin}#build`]),
      `构建 dsh-${plugin} 失败`,
    );
  }
  mkdirSync(DEV_DIR, { recursive: true });
  const patch = join(DEV_DIR, "plugins.patch.yml");
  const inserted = plugins.map((plugin) => {
    const entry = pathToFileURL(join(root, "packages", plugin, "lib/index.js")).href;
    return `    - id: ${plugin}\n      name: ${JSON.stringify(entry)}\n`;
  });
  writeFileSync(patch, `- insert:\n${inserted.join("")}`);
  return patch;
}

/**
 * Print what a run would do, without touching the tree.
 * @param target - the resolved target.
 */
function report(target) {
  const reasons = installReasons();
  console.log(`目标：${target.name} → @dsh-bot/client#${target.script}`);
  console.log(
    reasons.length === 0 ? "依赖：已是最新" : `依赖：需要 bun install（${reasons.join("；")}）`,
  );
  if (!target.host) {
    console.log("Host：该目标不启动本地 Host，跳过");
    return;
  }
  console.log(`Host：${hostStaleness() ?? "已是最新"}`);
}

/**
 * Start the client, and stop the Host it started when this process stops.
 * @param target - the resolved target.
 * @param patch - dev overlay for desktop targets.
 */
async function startClient(target, patch) {
  const env = { ...process.env };
  if (target.host) {
    env.PATH = [join(root, "target", "debug"), process.env.PATH].filter(Boolean).join(delimiter);
    env.DSH_BOT_PATCH = [process.env.DSH_BOT_PATCH, patch].filter(Boolean).join(delimiter);
  }
  child = spawn("bun", ["x", "vp", "run", `@dsh-bot/client#${target.script}`], {
    cwd: root,
    env,
    stdio: "inherit",
    // Its own process group, so one signal reaches the app and the Host it started.
    detached: process.platform !== "win32",
  });
  const code = await completed(child, undefined);
  child = undefined;
  if (code !== 0 && !stopping) process.exitCode = code;
}

/**
 * Signal the client and everything it started.
 * @param signal - POSIX signal name.
 */
function stopClient(signal) {
  if (child === undefined) return;
  if (process.platform === "win32") child.kill(signal);
  else process.kill(-child.pid, signal);
}

/**
 * Resolve the target, check the tree, then start it.
 * @param argv - command-line arguments after the script name.
 */
async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const named = argv.filter((argument) => argument !== "--dry-run");
  if (named.length > 1) throw new Error("用法：bun run dev [target] [--isolated[=<name>]]");
  const name = named[0];
  if (name !== undefined && !Object.hasOwn(TARGETS, name)) {
    throw new Error(`未知目标 ${name}；可选：${Object.keys(TARGETS).join("、")}`);
  }
  const target = name === undefined ? DESKTOP : { name, ...TARGETS[name] };
  if (dryRun) {
    report(target);
    return;
  }
  await ensureInstalled();
  let patch;
  if (target.host) {
    await ensureHost();
    patch = await prepareOverlay();
  }
  if (stopping) return;
  await startClient(target, patch);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    stopClient(signal);
  });
}

try {
  await main(args);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  stopping = true;
  stopClient("SIGTERM");
  rmSync(DEV_DIR, { recursive: true, force: true });
}
