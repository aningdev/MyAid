/**
 * Host control smoke (cross-platform): serve → status → ensureDsh → stopDsh.
 * Node `net.connect(path)` accepts Unix sockets and `\\.\pipe\...` named pipes.
 */
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const data = await mkdtemp(join(tmpdir(), "myaid-smoke-"));
const endpoint =
  process.platform === "win32"
    ? String.raw`\\.\pipe\myaid-host-smoke`
    : join(data, "host", "control.sock");

const hostEnv = { ...process.env, MYAID_HOST_SOCKET: endpoint };

function call(operation, source) {
  return new Promise((resolveCall, reject) => {
    const connection = connect(endpoint);
    let result = "";
    const finish = (error, value) => {
      connection.destroy();
      if (error) reject(error);
      else resolveCall(value);
    };
    connection.setTimeout(90000, () => finish(new Error("control call timeout")));
    connection.on("error", (error) => finish(error));
    connection.on("connect", () => {
      const req = { version: 1, id: "smoke", operation };
      if (source) req.source = source;
      connection.write(JSON.stringify(req) + "\n");
    });
    connection.on("data", (chunk) => {
      result += chunk.toString();
      if (result.includes("\n")) {
        try {
          finish(null, JSON.parse(result.split("\n")[0]));
        } catch (error) {
          finish(error);
        }
      }
    });
  });
}

async function waitReady(child, deadlineMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    if (child.exitCode !== null) throw new Error("host exited before ready");
    try {
      const status = await call("status");
      if (status?.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("control endpoint not ready");
}

const host = spawn(
  "cargo",
  [
    "run",
    "--quiet",
    "--manifest-path",
    "apps/host/Cargo.toml",
    "--bin",
    "myaid-host",
    "--",
    "serve",
    "--data-root",
    data,
    "--official-dsh",
  ],
  { cwd: root, env: hostEnv, stdio: ["ignore", "inherit", "inherit"] },
);

try {
  await waitReady(host);
  console.log("== status ==");
  console.log(JSON.stringify(await call("status")));
  console.log("== ensureDsh ==");
  const ensured = await call("ensureDsh", "userStart");
  console.log(JSON.stringify(ensured));
  if (!ensured.ok) {
    console.warn(
      "ensureDsh failed (Host control OK; official dsh may be unavailable):",
      ensured.error,
    );
  } else {
    console.log("== connectionInfo ==");
    console.log(JSON.stringify(await call("connectionInfo")));
    console.log("== stopDsh ==");
    console.log(JSON.stringify(await call("stopDsh")));
  }
  console.log("OK");
} finally {
  if (host.exitCode === null && host.signalCode === null) {
    host.kill();
    await new Promise((r) => host.once("exit", r));
  }
  await rm(data, { recursive: true, force: true });
}
