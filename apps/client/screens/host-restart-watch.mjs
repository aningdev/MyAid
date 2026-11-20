#!/usr/bin/env node
/**
 * The outside hand for `host-launcher.smoke.test.tsx`'s restart step.
 *
 * The app cannot stop a process, so this watcher does: it reads the scratch data root's session
 * log, waits until the smoke's second turn is open and still growing, then stops that Host
 * (`SIGTERM`, which lets it take its dsh down with it). The restarting is the app's launcher's,
 * which is the behaviour the smoke proves. Only a Host whose command line names the port is
 * touched, and it acts once.
 *
 *   node apps/client/screens/host-restart-watch.mjs --root <home>/.dsh-bot --port 4879
 *
 * Logs each stop to stdout; stop with Ctrl-C.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  if (process.argv[index] === "--repeat") {
    args.set("--repeat", "1");
    index -= 1;
    continue;
  }
  args.set(process.argv[index], process.argv[index + 1]);
}
const root = args.get("--root") ? resolve(args.get("--root")) : "";
const port = args.get("--port") ?? "4872";
/** How many turns must have started before one is stopped: the smoke's second prompt. */
const afterTurns = Number(args.get("--after-turns") ?? 2);
const repeat = args.has("--repeat");
const pollMs = Number(args.get("--poll-ms") ?? 400);

if (!root) {
  console.error(
    "usage: host-restart-watch.mjs --root DIR --port PORT [--after-turns N] [--repeat]",
  );
  process.exit(2);
}

const ZSTD = existsSync("/opt/homebrew/bin/zstd") ? "/opt/homebrew/bin/zstd" : "zstd";

/** The Host this launcher started, by its exact command line. */
function hostPids() {
  const expected = `dsh-bot-host serve-app --port ${port}`;
  const listing = execFileSync("/bin/ps", ["-Ao", "pid=,command="], { encoding: "utf8" });
  const pids = [];
  for (const line of listing.split("\n")) {
    const match = line.trim().match(/^(\d+)\s+(.*)$/);
    if (match && match[2] === expected) pids.push(Number.parseInt(match[1], 10));
  }
  return pids;
}

/** Stop every Host on this port; the launcher starts the next one. */
function stopHost() {
  const pids = hostPids();
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
      process.stdout.write(`${new Date().toISOString()} stopped Host ${pid}\n`);
    } catch {
      // Already gone.
    }
  }
  return pids.length > 0;
}

/** The newest session log, with how many turns it started and ended, and its size. */
function newestSession() {
  const sessions = join(root, "sessions");
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
      if (!best || info.mtimeMs > best.mtimeMs) {
        best = { file, mtimeMs: info.mtimeMs, size: info.size };
      }
    }
  }
  if (!best) return null;
  let text = "";
  try {
    text = execFileSync(ZSTD, ["-dcq", best.file], { encoding: "utf8" });
  } catch {
    // A log being written may end mid-frame; the next poll reads it whole.
    text = "";
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
  return { ...best, starts, ends };
}

let done = false;
let armedAt = null;
process.stdout.write(`watching ${join(root, "sessions")} for turn ${afterTurns}\n`);
setInterval(() => {
  if (done && !repeat) return;
  const session = newestSession();
  if (!session) return;
  // The turn is written when it starts; the Host is stopped a moment later, mid-flight.
  if (session.starts < afterTurns) return;
  if (armedAt === null) {
    armedAt = Date.now();
    return;
  }
  if (Date.now() - armedAt < 1000) return;
  if (!stopHost()) return;
  if (!repeat) done = true;
  armedAt = null;
}, pollMs);
