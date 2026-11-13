/**
 * Dev launcher: ensure Host control socket, then start the NSH client.
 * Closing the client leaves Host running until Ctrl+C.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSocket =
  process.platform === "win32"
    ? String.raw`\\.\pipe\myaid-host`
    : join(homedir(), ".myaid/host/control.sock");
const socket = process.env.MYAID_HOST_SOCKET || defaultSocket;
/** @type {import('node:child_process').ChildProcess | undefined} */
let host;
/** @type {import('node:child_process').ChildProcess | undefined} */
let client;
let stopping = false;
/** Temp directory holding the dev-only overlay that loads the Bot preset plugin. */
let devPluginDir;

/** Build the Bot preset plugin and write a `--patch` overlay naming its absolute entry. */
async function prepareBotPresetsPatch() {
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

/** Probe public Host status only — never connectionInfo / auth. */
function probe() {
  return new Promise((resolveProbe) => {
    const connection = connect(socket);
    let result = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      connection.destroy();
      resolveProbe(value);
    };
    connection.setTimeout(1500, () => finish("invalid"));
    connection.on("error", (error) =>
      finish(["ENOENT", "ECONNREFUSED"].includes(error?.code ?? "") ? "missing" : "invalid"),
    );
    connection.on("connect", () =>
      connection.write(JSON.stringify({ version: 1, id: "dev-probe", operation: "status" }) + "\n"),
    );
    connection.on("data", (chunk) => {
      result += chunk.toString();
      if (result.length > 16384) return finish("invalid");
      if (!result.includes("\n")) return;
      try {
        const response = JSON.parse(result.split("\n")[0]);
        finish(
          response.version === 1 &&
            response.id === "dev-probe" &&
            response.ok === true &&
            typeof response.value?.phase === "string"
            ? "ready"
            : "invalid",
        );
      } catch {
        finish("invalid");
      }
    });
    connection.on("end", () => finish("invalid"));
  });
}

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

async function stopOwnedHost() {
  if (!host || host.exitCode !== null || host.signalCode !== null) return;
  const done = completed(host);
  host.kill("SIGTERM");
  await done;
}

async function main() {
  const existing = await probe();
  if (existing === "invalid") {
    throw new Error("宿主控制端点不可用或协议不兼容，请检查后重试");
  }
  if (existing === "missing") {
    if (socket !== defaultSocket) {
      throw new Error("指定的开发宿主未运行，请先启动该宿主或移除 MYAID_HOST_SOCKET");
    }
    console.log("正在启动开发 Host…");
    const patch = await prepareBotPresetsPatch();
    const again = await probe();
    if (again === "invalid") throw new Error("宿主控制端点不可用或协议不兼容");
    if (again === "missing") {
      host = run(
        "cargo",
        [
          "run",
          "--manifest-path",
          "apps/host/Cargo.toml",
          "--bin",
          "myaid-host",
          "--",
          "serve-app",
        ],
        {
          env: {
            ...process.env,
            MYAID_DSH_PATCH: [process.env.MYAID_DSH_PATCH, patch]
              .filter(Boolean)
              .join(process.platform === "win32" ? ";" : ":"),
          },
        },
      );
      const exit = completed(host);
      let exited = false;
      void exit.then(() => {
        exited = true;
      });
      const deadline = Date.now() + 60000;
      while (true) {
        if (exited) throw new Error("开发 Host 启动失败，请检查上方错误");
        const state = await probe();
        if (state === "ready") break;
        if (state === "invalid") throw new Error("开发 Host 控制端点不可用");
        if (Date.now() >= deadline) throw new Error("等待开发 Host 超时");
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      }
      void exit.then(() => {
        if (!stopping) {
          console.error("开发 Host 已退出");
          client?.kill("SIGTERM");
          process.exitCode = 1;
        }
      });
    }
  }
  if (stopping) return;
  console.log("开发 Host 已就绪；客户端连接时会自动启动官方后台。");
  client = run("bun", ["run", "--cwd", "apps/client", "dev"], {
    env: { ...process.env, MYAID_HOST_SOCKET: socket },
  });
  const result = await completed(client);
  client = undefined;
  if (result !== 0 && !stopping) process.exitCode = result;
  if (host && host.exitCode === null && host.signalCode === null && !stopping) {
    console.log("客户端已退出；开发 Host 继续运行。按 Ctrl+C 停止本次启动的 Host。");
    await new Promise((resolveWait) => {
      host.once("exit", () => resolveWait());
      process.once("SIGINT", () => resolveWait());
      process.once("SIGTERM", () => resolveWait());
    });
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    client?.kill(signal);
    void stopOwnedHost();
  });
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  stopping = true;
  await stopOwnedHost();
  if (devPluginDir) {
    rmSync(devPluginDir, { recursive: true, force: true });
    devPluginDir = undefined;
  }
}
