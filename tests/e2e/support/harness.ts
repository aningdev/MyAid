// The stack every case runs against, all on loopback and all real processes
// except dsh: a Relay (built with `frame-tap`), a Host whose Bridge dials that
// Relay, and a fake dsh web behind it. The Device is the Client's own relay
// Carrier, imported from `@dsh-bot/client/relay` in the test.

import { type ChildProcess, spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { type FakeDsh, type FakeDshOptions, startFakeDsh } from "./fake-dsh";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const binaries = join(process.env.CARGO_TARGET_DIR ?? join(repository, "target"), "debug");

/** A child process and the tail of what it wrote, kept to explain a failed start. */
class Process {
  readonly child: ChildProcess;
  private output = "";
  private lines: string[] = [];
  private waiting: ((line: string) => void) | null = null;
  readonly exited: Promise<void>;

  constructor(name: string, args: string[], env: Record<string, string>) {
    this.child = spawn(join(binaries, name), args, {
      env: { PATH: process.env.PATH ?? "", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.exited = new Promise((resolve) => this.child.once("exit", () => resolve()));
    this.child.stderr?.on("data", (chunk: Buffer) => this.keep(chunk.toString()));
    this.child.stdout?.on("data", (chunk: Buffer) => {
      this.output += chunk.toString();
      for (;;) {
        const end = this.output.indexOf("\n");
        if (end < 0) break;
        const line = this.output.slice(0, end);
        this.output = this.output.slice(end + 1);
        if (this.waiting) {
          this.waiting(line);
          this.waiting = null;
        } else this.lines.push(line);
      }
    });
  }

  private tail = "";
  private keep(text: string): void {
    this.tail = (this.tail + text).slice(-2000);
  }

  get log(): string {
    return this.tail;
  }

  /** The next line the process printed on stdout. */
  nextLine(): Promise<string> {
    const line = this.lines.shift();
    if (line !== undefined) return Promise.resolve(line);
    return new Promise((resolve, reject) => {
      this.waiting = resolve;
      void this.exited.then(() => reject(new Error(`exited early: ${this.tail}`)));
    });
  }

  async stop(): Promise<void> {
    if (this.child.exitCode !== null) return;
    this.child.kill("SIGTERM");
    const killer = setTimeout(() => this.child.kill("SIGKILL"), 5000);
    await this.exited;
    clearTimeout(killer);
  }
}

async function ready(process: Process): Promise<number> {
  const event = JSON.parse(await process.nextLine()) as { event: string; port: number };
  if (event.event !== "ready") throw new Error("not a ready line");
  return event.port;
}

export interface Stack {
  /** The Relay's address as the pairing link will carry it. */
  readonly relayUrl: string;
  /** The Relay's frame-tap file: one JSON line per relayed binary frame. */
  readonly tapPath: string;
  readonly dsh: FakeDsh;
  /** A call on the Host's local control surface, with its serve-token. */
  host(path: string, init?: { method?: string; body?: string }): Promise<Response>;
  stop(): Promise<void>;
}

/** Starts the stack; `stop()` ends every process and removes the data root. */
export async function startStack(options: FakeDshOptions): Promise<Stack> {
  const root = await mkdtemp(join(tmpdir(), "dsh-bot-e2e-"));
  const started: { stop(): Promise<void> }[] = [];
  const stop = async (): Promise<void> => {
    for (const unit of started.reverse()) await unit.stop().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  };
  try {
    const tapPath = join(root, "frames.jsonl");
    const relay = new Process(
      "dsh-bot-relay",
      ["serve", "--bind", "127.0.0.1", "--port", "0", "--ready-stdout", "--frame-tap", tapPath],
      {},
    );
    started.push(relay);
    const relayUrl = `http://127.0.0.1:${await ready(relay)}`;

    const dsh = await startFakeDsh(options);
    started.push(dsh);
    const pin = JSON.parse(
      await readFile(join(repository, "apps/host/supported-dsh.json"), "utf8"),
    ) as { version: string };
    const executable = join(root, "fake-dsh");
    await writeFile(
      executable,
      [
        "#!/bin/sh",
        `if [ "$1" = "--version" ]; then echo '${pin.version}'; exit 0; fi`,
        "echo 'dsh-host-pid: 4242'",
        `echo 'dsh web: ${dsh.loginUrl}'`,
        "exec sleep 3600",
        "",
      ].join("\n"),
    );
    await chmod(executable, 0o755);

    const dataRoot = join(root, "data");
    const host = new Process(
      "dsh-bot-host",
      ["serve", "--data-root", dataRoot, "--dsh", executable, "--port", "0", "--ready-stdout"],
      { DSH_BOT_PATCH: "", DSH_BOT_RELAY_URL: relayUrl },
    );
    started.push(host);
    const hostPort = await ready(host);
    const token = (await readFile(join(dataRoot, "host/serve-token"), "utf8")).trim();
    const call: Stack["host"] = (path, init = {}) =>
      fetch(`http://127.0.0.1:${hostPort}${path}`, {
        method: init.method ?? "GET",
        body: init.body,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });

    const start = await call("/dsh/start", { method: "POST", body: '{"source":"userStart"}' });
    if (!start.ok) throw new Error(`dsh start answered ${start.status}`);
    await until(
      "the fake dsh to be ready",
      async () => {
        const status = (await (await call("/status")).json()) as { phase?: string };
        return status.phase === "ready";
      },
      host,
    );
    return { relayUrl, tapPath, dsh, host: call, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

/** Polls `check` every 50 ms for 15 seconds. */
export async function until(
  what: string,
  check: () => Promise<boolean>,
  process?: { log: string },
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${what}${process ? `: ${process.log}` : ""}`);
}
