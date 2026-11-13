/**
 * Host control smoke (cross-platform): serve → status → ensure dsh → stop, over the
 * loopback HTTP API with the data root's token.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const data = await mkdtemp(join(tmpdir(), "myaid-smoke-"));
const port = 4876;
const base = `http://127.0.0.1:${port}`;

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
    "--port",
    String(port),
    "--official-dsh",
  ],
  { cwd: root, stdio: ["ignore", "inherit", "inherit"] },
);

async function token() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (host.exitCode !== null) throw new Error("host exited before it listened");
    try {
      const text = await readFile(join(data, "host/serve-token"), "utf8");
      if (text.trim()) return text.trim();
    } catch {
      // Not written yet.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("no serve-token");
}

async function call(method, path, body) {
  const bearer = await token();
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text}`);
  return JSON.parse(text);
}

try {
  // The token is written once the port is ours, so wait for it before the first probe.
  await token();
  let probe;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      probe = await fetch(`${base}/`);
      if (probe.ok) break;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!probe?.ok) throw new Error("the Host never answered on /");
  console.log("== / ==", probe.status, (await probe.text()).trim());
  console.log("== status ==", JSON.stringify(await call("GET", "/status")));
  const ensured = await call("POST", "/dsh/start", { source: "userStart" });
  console.log("== start ==", JSON.stringify(ensured));
  if (ensured.phase === "ready") {
    console.log("== connection ==", JSON.stringify(await call("GET", "/connection")));
    console.log("== stop ==", JSON.stringify(await call("POST", "/dsh/stop", {})));
  }
  console.log("== registration ==", JSON.stringify(await call("GET", "/registration")));
  console.log("OK");
} finally {
  if (host.exitCode === null && host.signalCode === null) {
    host.kill();
    await new Promise((r) => host.once("exit", r));
  }
  await rm(data, { recursive: true, force: true });
  try {
    execFileSync("true");
  } catch {
    // Nothing to clean outside the data root.
  }
}
