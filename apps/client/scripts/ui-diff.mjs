#!/usr/bin/env bun
/**
 * The client's UI layer against shadcn-nsh's registry: every copied file and
 * `theme.json` must be the registry's (exit 1 when one differs). Runs in
 * `check`.
 *
 * The CLI is the app's `shadcn-nsh` devDependency, run through its `bin`, and
 * `nsh-ui.json` pins the registry to that release's tag, so a moving `main`
 * cannot turn the check red: upgrading is the tag and the version together.
 *
 * An unreachable registry ends in one line naming it, not in Bun's fetch
 * stack trace.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resolve = createRequire(import.meta.url);
const pkgPath = resolve.resolve("shadcn-nsh/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const cli = path.join(path.dirname(pkgPath), pkg.bin["shadcn-nsh"]);
const { registry } = JSON.parse(readFileSync(path.join(app, "nsh-ui.json"), "utf8"));

const run = spawnSync(process.execPath, [cli, "diff", "-c", "."], { cwd: app, encoding: "utf8" });
const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
const offline =
  /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|Unable to connect|fetch failed|getaddrinfo/;

if (run.status !== 0 && offline.test(output)) {
  console.error(
    `ui:diff: the shadcn-nsh registry is unreachable (${registry}) — nothing was compared. Check the network or nsh-ui.json's registry.`,
  );
  process.exit(1);
}
process.stdout.write(run.stdout ?? "");
process.stderr.write(run.stderr ?? "");
process.exit(run.status ?? 1);
