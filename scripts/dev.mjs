/**
 * Dev launcher: build the Host, then start the NSH client. The client starts the Host itself
 * (`lib/host/launcher`), so this script only makes sure the binary exists and that `myaid-host`
 * resolves on PATH for the app it starts. Closing the client stops the Host it started.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "target", "debug");
const delimiter = process.platform === "win32" ? ";" : ":";
/** @type {import('node:child_process').ChildProcess | undefined} */
let client;
let stopping = false;
/** Temp directory holding the dev-only overlay that loads the Bot preset plugin. */
let devPluginDir;

function run(program, args, options = {}) {
  return spawn(program, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
}

function completed(child) {
  return new Promise((resolveExit) => {
    child.once("error", (error) => {
      console.error(error.message);
      resolveExit(1);
    });
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

/** Build the Host the client launches, and the Bot preset plugin's dev overlay. */
async function prepare() {
  const host = await completed(run("cargo", ["build", "-p", "myaid-host"]));
  if (host !== 0) throw new Error("构建 myaid-host 失败");
  const pluginDir = join(root, "packages/myaid-plugin-bot-presets");
  const built = await completed(
    run("bun", ["x", "vp", "run", "@myaid/myaid-plugin-bot-presets#build"]),
  );
  if (built !== 0) throw new Error("构建 myaid-plugin-bot-presets 失败");
  devPluginDir = mkdtempSync(join(tmpdir(), "myaid-dev-"));
  const patch = join(devPluginDir, "bot-presets.patch.yml");
  const entry = pathToFileURL(join(pluginDir, "lib", "index.js")).href;
  writeFileSync(
    patch,
    `- insert:\n    - id: myaid-bot-presets\n      name: ${JSON.stringify(entry)}\n`,
  );
  return patch;
}

async function main() {
  const patch = await prepare();
  if (stopping) return;
  console.log("Host 已构建；客户端会自己启动它。");
  client = run("bun", ["run", "--cwd", "apps/client", "dev"], {
    env: {
      ...process.env,
      PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter),
      MYAID_DSH_PATCH: [process.env.MYAID_DSH_PATCH, patch].filter(Boolean).join(delimiter),
    },
  });
  const result = await completed(client);
  client = undefined;
  if (result !== 0 && !stopping) process.exitCode = result;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    client?.kill(signal);
  });
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  stopping = true;
  if (devPluginDir) {
    rmSync(devPluginDir, { recursive: true, force: true });
    devPluginDir = undefined;
  }
}
