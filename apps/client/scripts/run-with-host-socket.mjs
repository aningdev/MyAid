/**
 * Cross-platform wrapper: ensure MYAID_HOST_SOCKET then exec nsh (+ args).
 * Replaces Unix `env VAR=...` which is unavailable on Windows shells.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const defaultSocket =
  process.platform === "win32"
    ? String.raw`\\.\pipe\myaid-host`
    : join(homedir(), ".myaid/host/control.sock");

const env = {
  ...process.env,
  MYAID_HOST_SOCKET: process.env.MYAID_HOST_SOCKET || defaultSocket,
};

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: bun scripts/run-with-host-socket.mjs <nsh-args...>");
  process.exit(1);
}

const child = spawn(args[0], args.slice(1), {
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});
child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
