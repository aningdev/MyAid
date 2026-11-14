/**
 * The workspace's one dsh version source: `package.json` → `workspaces.catalog`.
 *
 * Every `@deepseek-ai/*` pin lives there and packages reference it with
 * `"catalog:"`. `apps/host/supported-dsh.json` still names the dsh version for
 * the Host (it compiles that file in), so the two must agree — `check`, `dev`
 * and the Client's `prepare:sdk` read both from here instead of hardcoding.
 *
 * Upgrade: edit the catalog's dsh entries and `apps/host/supported-dsh.json`
 * together, then `bun install`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repository root, resolved from this file rather than the caller's cwd. */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Package names whose version must follow the pinned official dsh release. */
const DSH = /^@deepseek-ai\/dsh-/;

/** A concrete version, as opposed to a range (`~4.1.0`, `^1.2.3`). */
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Dependency fields a workspace package may pin another package in. */
const FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/**
 * Read a JSON file.
 * @param path - absolute path.
 * @returns the parsed value.
 */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * The root manifest's catalog: name → version or range.
 * @param rootDir - repository root.
 * @returns the catalog as declared.
 */
export function catalog(rootDir = root) {
  return readJson(join(rootDir, "package.json")).workspaces?.catalog ?? {};
}

/**
 * Every workspace manifest, root included.
 * @param rootDir - repository root.
 * @returns one entry per manifest, in the order bun resolves them.
 */
export function manifests(rootDir = root) {
  const found = [{ name: "@myaid/workspace", path: join(rootDir, "package.json") }];
  for (const group of ["apps", "packages"]) {
    const dir = join(rootDir, group);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name, "package.json");
      if (!existsSync(path)) continue;
      found.push({ name: readJson(path).name, path });
    }
  }
  return found;
}

/**
 * The dsh version the catalog pins.
 * @param catalogEntries - catalog from {@link catalog}.
 * @returns the one exact dsh version every dsh catalog entry shares.
 */
export function dshVersion(catalogEntries) {
  const versions = new Set(
    Object.entries(catalogEntries)
      .filter(([name, value]) => DSH.test(name) && EXACT.test(value))
      .map(([, value]) => value),
  );
  if (versions.size !== 1) {
    throw new Error(
      `workspaces.catalog 里的 dsh 版本必须只有一个，实际是 ${[...versions].join(", ") || "（没有）"}`,
    );
  }
  return [...versions][0];
}

/**
 * The dsh version the Host compiles in (`apps/host/supported-dsh.json`).
 * @param rootDir - repository root.
 * @returns that version.
 */
export function supportedDsh(rootDir = root) {
  return readJson(join(rootDir, "apps/host/supported-dsh.json")).version;
}

/**
 * Whether an installed version satisfies a catalog value.
 * @param installed - version found in `node_modules`.
 * @param want - catalog value: an exact version or a `^` / `~` range.
 * @returns true when `installed` is acceptable.
 */
function satisfies(installed, want) {
  if (EXACT.test(want)) return installed === want;
  const wanted = /^([\^~])(\d+)\.(\d+)\.(\d+)/.exec(want);
  if (wanted === null) return false;
  const [, operator, major, minor, patch] = wanted;
  const actual = /^(\d+)\.(\d+)\.(\d+)/.exec(installed);
  if (actual === null) return false;
  const [, aMajor, aMinor, aPatch] = actual.map(Number);
  if (operator === "^") {
    return (
      aMajor === Number(major) && aMinor * 1000 + aPatch >= Number(minor) * 1000 + Number(patch)
    );
  }
  return aMajor === Number(major) && aMinor === Number(minor) && aPatch >= Number(patch);
}

/**
 * Every `@deepseek-ai/*` package a workspace package declares, and where.
 * @param rootDir - repository root.
 * @returns name → declaring manifest names.
 */
export function declaredDeepseek(rootDir = root) {
  const declared = new Map();
  for (const { name, path } of manifests(rootDir)) {
    for (const field of FIELDS) {
      for (const dependency of Object.keys(readJson(path)[field] ?? {})) {
        if (!dependency.startsWith("@deepseek-ai/")) continue;
        if (!declared.has(dependency)) declared.set(dependency, new Set());
        declared.get(dependency).add(name);
      }
    }
  }
  return declared;
}

/**
 * The version of a package that is actually installed at the workspace root.
 * @param name - package name.
 * @param rootDir - repository root.
 * @returns the installed version, or null when the package is missing.
 */
export function installedVersion(name, rootDir = root) {
  const path = join(rootDir, "node_modules", name, "package.json");
  return existsSync(path) ? readJson(path).version : null;
}

/**
 * Installed `@deepseek-ai/*` packages that disagree with the catalog.
 * @param rootDir - repository root.
 * @returns one entry per drifted package; empty when the tree is fresh.
 */
export function installedDrift(rootDir = root) {
  const catalogEntries = catalog(rootDir);
  const drift = [];
  for (const [name, sources] of declaredDeepseek(rootDir)) {
    const pinned = catalogEntries[name];
    if (pinned === undefined) continue;
    const installed = installedVersion(name, rootDir);
    if (installed !== null && satisfies(installed, pinned)) continue;
    drift.push({ name, want: pinned, got: installed, declaredBy: [...sources] });
  }
  return drift;
}

/**
 * Everything that must agree for the version source to hold: the catalog's dsh
 * version against `apps/host/supported-dsh.json`, and every workspace package
 * against `"catalog:"` instead of a hand-written dsh pin.
 * @param rootDir - repository root.
 * @returns human-readable problems; empty when the pins agree.
 */
export function pinProblems(rootDir = root) {
  const catalogEntries = catalog(rootDir);
  const problems = [];
  let pinned;
  try {
    pinned = dshVersion(catalogEntries);
  } catch (error) {
    return [error.message];
  }
  const host = supportedDsh(rootDir);
  if (host !== pinned) {
    problems.push(
      `apps/host/supported-dsh.json 是 ${host}，workspaces.catalog 的 dsh 版本是 ${pinned}`,
    );
  }
  for (const { name, path } of manifests(rootDir)) {
    if (path === join(rootDir, "package.json")) continue;
    const manifest = readJson(path);
    for (const field of FIELDS) {
      for (const [dependency, value] of Object.entries(manifest[field] ?? {})) {
        if (!DSH.test(dependency)) continue;
        if (catalogEntries[dependency] === undefined) {
          problems.push(`${name} 的 ${field}.${dependency} 在 catalog 里没有对应版本`);
          continue;
        }
        if (value !== "catalog:") {
          problems.push(`${name} 的 ${field}.${dependency} 写死了 ${value}，应改为 "catalog:"`);
        }
      }
    }
  }
  return problems;
}
