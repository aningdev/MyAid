#!/usr/bin/env node
/**
 * The outside hand for `session-model.smoke.test.tsx`'s restart step.
 *
 * The app cannot signal a process, and this dev host gives a test app no
 * filesystem and no HTTP beyond dsh, so the trigger lives outside entirely:
 * this watcher reads the scratch Host's session log, waits until a turn is
 * open (`turn/start` with no `turn/end`) *and* events are still arriving, then
 * kills the Host and the dsh it spawned and starts a fresh Host on the same
 * data root and socket. The smoke only has to wait for "Host disconnected".
 *
 * Nothing outside that data root is touched: a `dsh` whose working directory
 * is not the scratch root — the person's own DeepSeek Harness app, say — is
 * left alone. It acts once (`--repeat` watches for further turns).
 *
 *   node apps/client/screens/restart-watcher.mjs \
 *     --data-root .myaid-smoke/data --socket .myaid-smoke/host.sock
 *
 * Logs each restart to stdout; stop with Ctrl-C.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  if (process.argv[index] === "--repeat") {
    args.set("--repeat", "1");
    index -= 1;
    continue;
  }
  args.set(process.argv[index], process.argv[index + 1]);
}
const dataRoot = args.get("--data-root") ? resolve(args.get("--data-root")) : "";
const socket = args.get("--socket") ?? "";
const hostBin =
  args.get("--host-bin") ??
  join(dirname(fileURLToPath(import.meta.url)), "../../../target/debug/myaid-host");
const repeat = args.has("--repeat");
const pollMs = Number(args.get("--poll-ms") ?? 500);

if (!dataRoot || !socket) {
  console.error("usage: restart-watcher.mjs --data-root DIR --socket PATH [--repeat]");
  process.exit(2);
}

/** The Host's real path, which `lsof` reports for a dsh's working directory. */
const realRoot = execFileSync("/bin/sh", ["-c", `cd '${dataRoot}' && pwd -P`], {
  encoding: "utf8",
}).trim();

function kill(pattern) {
  try {
    execFileSync("/usr/bin/pkill", ["-9", "-f", pattern]);
  } catch {
    // Nothing matched: already gone.
  }
}

/**
 * Kill the dsh this Host spawned (its working directory is the data root).
 * The dsh can outlive its Host for a moment, and `ps` may lag behind, so this
 * looks a few times before giving up: a survivor holds the session writer lock
 * and the replacement dsh could not resume the turn.
 * @returns whether anything was killed.
 */
function killScratchDsh() {
  let killed = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (killScratchDshOnce()) killed = true;
    else if (killed) return killed;
    execFileSync("/bin/sleep", ["0.2"]);
  }
  if (!killed) process.stdout.write("no scratch dsh found to kill\n");
  return killed;
}

/** One pass over the process table for the dsh whose cwd is the data root. */
function killScratchDshOnce() {
  let found = false;
  const listing = execFileSync("/bin/ps", ["-Ao", "pid=,comm="], { encoding: "utf8" });
  for (const line of listing.split("\n")) {
    if (!line.includes("DeepSeek Harness") || line.includes("Helper")) continue;
    const pid = line.trim().split(/\s+/)[0];
    let cwd = "";
    try {
      cwd =
        execFileSync("/bin/sh", ["-c", `/usr/sbin/lsof -a -p ${pid} -d cwd -Fn`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        })
          .split("\n")
          .find((item) => item.startsWith("n"))
          ?.slice(1) ?? "";
    } catch {
      // The process ended between `ps` and `lsof`: nothing to kill.
      continue;
    }
    if (cwd !== realRoot) continue;
    process.stdout.write(`killing dsh ${pid} (${cwd})\n`);
    try {
      process.kill(Number(pid), "SIGKILL");
      found = true;
    } catch {
      // Already gone.
    }
  }
  return found;
}

function restart() {
  kill(`myaid-host serve --data-root ${dataRoot}`);
  kill(`myaid-host guardian --data-root ${dataRoot}`);
  killScratchDsh();
  const started = spawn(hostBin, ["serve", "--data-root", dataRoot, "--official-dsh"], {
    env: { ...process.env, MYAID_HOST_SOCKET: socket },
    detached: true,
    stdio: "ignore",
  });
  started.unref();
  process.stdout.write(`host restarted as ${started.pid ?? "?"}\n`);
}

/** The newest session log, with its size and whether a turn is still open. */
function newestTurn() {
  const sessions = join(dataRoot, "sessions");
  // dsh is started on demand: the directory appears with the first client.
  if (!existsSync(sessions)) return null;
  let best = null;
  for (const workspace of readdirSync(sessions, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue;
    const workspaceDir = join(sessions, workspace.name);
    for (const session of readdirSync(workspaceDir, { withFileTypes: true })) {
      if (!session.isDirectory()) continue;
      const file = join(workspaceDir, session.name, "session.v4.jsonl.zstd");
      let info;
      try {
        info = statSync(file);
      } catch {
        continue;
      }
      if (!best || info.mtimeMs > best.mtimeMs)
        best = { file, mtimeMs: info.mtimeMs, size: info.size };
    }
  }
  if (!best) return null;
  let text = "";
  try {
    text = execFileSync("/opt/homebrew/bin/zstd", ["-dc", best.file], { encoding: "utf8" });
  } catch {
    // A log being written may end mid-frame; the next poll reads it whole.
    try {
      text = execFileSync("/opt/homebrew/bin/zstd", ["-dcq", best.file], { encoding: "utf8" });
    } catch {
      text = "";
    }
  }
  let starts = 0;
  let ends = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "turn/start") starts += 1;
      if (event.type === "turn/end") ends += 1;
    } catch {
      // Ignore a partial line.
    }
  }
  return { ...best, open: starts > ends };
}

let lastSize = -1;
let done = false;
process.stdout.write(`watching ${join(dataRoot, "sessions")} for a live turn\n`);
setInterval(() => {
  if (done && !repeat) return;
  const turn = newestTurn();
  if (!turn) return;
  const growing = turn.size !== lastSize;
  lastSize = turn.size;
  // A turn that is still open while its log keeps growing is mid-flight.
  if (!turn.open || !growing) return;
  process.stdout.write(`${new Date().toISOString()} live turn in ${turn.file}\n`);
  try {
    restart();
  } catch (error) {
    // The Host still has to come back: report the cleanup hiccup, then start it.
    process.stdout.write(`restart cleanup failed: ${String(error)}\n`);
    restart();
  }
  if (!repeat) done = true;
}, pollMs);
