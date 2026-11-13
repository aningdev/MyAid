/**
 * Run `nsh` with this repo's Host binary on PATH.
 *
 * The app starts the Host itself (`lib/host/launcher`), which resolves `myaid-host` on PATH —
 * the one name `nsh.json` grants to `capabilities.process.execute`. `cargo build -p myaid-host`
 * puts it in `target/debug`; this script makes sure that folder leads PATH for the app and the
 * Host it starts.
 */
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const bin = join(root, "target", "debug");
const delimiter = process.platform === "win32" ? ";" : ":";

const env = {
  ...process.env,
  PATH: [bin, process.env.PATH].filter(Boolean).join(delimiter),
};

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: bun scripts/run-with-host-path.mjs <nsh-args...>");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
