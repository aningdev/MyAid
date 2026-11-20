#!/usr/bin/env node
/**
 * `nsh test` for a whole app, one process per test file, several at once.
 *
 * `nsh test` runs an app's test files one after another, and every file opens
 * engines of its own anyway, so the file is the unit to spread across cores.
 * Run it from the app's directory. With any argument (a file, `--filter`,
 * `--target`, `--junit`, …) it is plain `nsh test` with those arguments.
 *
 * `NSH_TEST_JOBS` sets the number of workers (default: cores − 1, at most 8).
 * The longest files start first, by the durations the last run recorded under
 * `node_modules/.cache`. Real-Host smokes (`*.smoke.test.tsx`) share one Host
 * scratch root, so when `DSH_BOT_SMOKE_HOST` turns them on they run one at a
 * time after the pool; otherwise they return at once and stay in it.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import path from "node:path";

const app = process.cwd();
const args = process.argv.slice(2);

/** Run `nsh test` with these arguments; resolves its exit code and output. */
function nshTest(testArgs, inherit) {
  return new Promise((resolve, reject) => {
    const child = spawn("nsh", ["test", ...testArgs], {
      cwd: app,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

if (args.length > 0) {
  const { code } = await nshTest(args, true);
  process.exit(code);
}

/** Every `*.test.ts(x)` under the app, relative, outside `node_modules` and dot directories. */
function testFiles(dir = "") {
  return readdirSync(path.join(app, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" || entry.name.startsWith(".") ? [] : testFiles(relative);
    }
    return /\.test\.tsx?$/.test(entry.name) ? [relative] : [];
  });
}

const cacheFile = path.join(app, "node_modules", ".cache", "nsh-test-durations.json");
let durations = {};
try {
  durations = JSON.parse(readFileSync(cacheFile, "utf8"));
} catch {
  // No earlier run: every file starts with the same estimate.
}

const smokesOn = Boolean(process.env.DSH_BOT_SMOKE_HOST);
const files = testFiles().sort((a, b) => (durations[b] ?? 1) - (durations[a] ?? 1));
const serial = smokesOn ? files.filter((file) => file.endsWith(".smoke.test.tsx")) : [];
const pooled = files.filter((file) => !serial.includes(file));
const jobs = Math.max(
  1,
  Number(process.env.NSH_TEST_JOBS) || Math.min(8, availableParallelism() - 1),
);

const summary = /(\d+) tests?: (\d+) passed, (\d+) failed/;
const failures = [];
let tests = 0;

async function runFile(file) {
  const started = Date.now();
  const { code, output } = await nshTest([file], false);
  const seconds = (Date.now() - started) / 1000;
  durations[file] = seconds;
  const counts = output.match(summary);
  if (code === 0 && counts && counts[3] === "0") {
    tests += Number(counts[1]);
    console.log(`✓ ${file} — ${counts[1]} tests (${seconds.toFixed(1)}s)`);
    return;
  }
  failures.push(file);
  console.log(`✗ ${file} (${seconds.toFixed(1)}s)\n${output.trimEnd()}\n`);
}

const started = Date.now();
const queue = [...pooled];
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let file = queue.shift(); file; file = queue.shift()) await runFile(file);
  }),
);
for (const file of serial) await runFile(file);

mkdirSync(path.dirname(cacheFile), { recursive: true });
writeFileSync(cacheFile, JSON.stringify(durations, null, 2));

const wall = ((Date.now() - started) / 1000).toFixed(0);
if (failures.length > 0) {
  console.log(
    `✗ ${failures.length} of ${files.length} files failed (${wall}s, ${jobs} jobs):\n  ${failures.join("\n  ")}`,
  );
  process.exit(1);
}
console.log(`✓ ${tests} tests in ${files.length} files: all passed (${wall}s, ${jobs} jobs)`);
