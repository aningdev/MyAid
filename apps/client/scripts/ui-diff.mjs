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
 * A pinned tag never changes, so the first run mirrors the whole registry
 * (its index and every item) under `node_modules/.cache`, keyed by the URL
 * template, and the CLI compares against that mirror through `file://`: the
 * comparison is the same, and later runs need no network. A new tag is a new
 * key, so it mirrors again.
 *
 * An unreachable registry ends in one line naming it, not in Bun's fetch
 * stack trace.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const app = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const resolve = createRequire(import.meta.url);
const pkgPath = resolve.resolve("shadcn-nsh/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const cli = path.join(path.dirname(pkgPath), pkg.bin["shadcn-nsh"]);
const { registry } = JSON.parse(readFileSync(path.join(app, "nsh-ui.json"), "utf8"));

const key = createHash("sha256").update(registry).digest("hex").slice(0, 16);
const mirror = path.join(app, "node_modules", ".cache", "shadcn-nsh-registry", key);
const complete = path.join(mirror, ".complete");

/** Fetch one registry document into the mirror. */
async function copy(name) {
  const url = registry.replaceAll("{name}", name);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  const body = await response.text();
  writeFileSync(path.join(mirror, `${name}.json`), body);
  return body;
}

if (!existsSync(complete)) {
  rmSync(mirror, { recursive: true, force: true });
  mkdirSync(mirror, { recursive: true });
  try {
    const index = JSON.parse(await copy("index"));
    await Promise.all(index.items.map((item) => copy(item.name)));
  } catch (error) {
    rmSync(mirror, { recursive: true, force: true });
    console.error(
      `ui:diff: the shadcn-nsh registry is unreachable (${registry}) — nothing was compared. Check the network or nsh-ui.json's registry. ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
  writeFileSync(complete, registry);
}

const local = `${pathToFileURL(mirror).href}/{name}.json`;
const run = spawnSync(process.execPath, [cli, "diff", "-c", ".", "--registry", local], {
  cwd: app,
  encoding: "utf8",
});
process.stdout.write(run.stdout ?? "");
process.stderr.write(run.stderr ?? "");
process.exit(run.status ?? 1);
