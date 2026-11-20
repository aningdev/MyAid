/**
 * The workspace's one dsh version source: `package.json` → `workspaces.catalog`.
 *
 * Every `@deepseek-ai/*` pin lives there and packages reference it with
 * `"catalog:"`. Two other places must agree with it: `apps/host/supported-dsh.json`
 * (the Host compiles it in) and the `dsh-v<version>` tag checked out in
 * `references/deepseek-harness`. `check`, `dev` and the Client's `prepare:sdk`
 * read them from here instead of hardcoding.
 *
 * Upgrade: edit the catalog's dsh entries and `apps/host/supported-dsh.json`,
 * check out the matching tag in the submodule, then `bun install`.
 */
import { execFileSync } from "node:child_process";
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
 * Compare two versions by SemVer precedence, prerelease tags included.
 * @param a - a version like `0.2.2-rc.5`.
 * @param b - the version to compare against.
 * @returns a negative number, zero, or a positive number.
 */
function compareVersions(a, b) {
  const split = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(value);
    if (match === null) throw new Error(`版本号不是 SemVer：${value}`);
    const [, major, minor, patch, pre = ""] = match;
    return { core: [Number(major), Number(minor), Number(patch)], pre };
  };
  const left = split(a);
  const right = split(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = left.core[index] - right.core[index];
    if (difference !== 0) return difference;
  }
  // A prerelease precedes the release it qualifies.
  if (left.pre === right.pre) return 0;
  if (left.pre === "") return 1;
  if (right.pre === "") return -1;
  return left.pre.localeCompare(right.pre, "en", { numeric: true });
}

/**
 * Whether a version lies in a range written as `&&`-style comparators.
 * @param version - the version to test.
 * @param range - comparators separated by spaces, such as `>=0.2.2-rc.5 <0.3.0`.
 * @returns true when every comparator accepts the version.
 */
function inRange(version, range) {
  return range
    .split(" ")
    .filter((part) => part !== "")
    .every((part) => {
      const [, operator = "=", wanted] = /^(>=|<=|>|<|=|\^|~)?(.+)$/.exec(part) ?? [];
      if (wanted === undefined) throw new Error(`engines.dsh 片段无法解析：${part}`);
      const order = compareVersions(version, wanted);
      switch (operator) {
        case ">=":
          return order >= 0;
        case ">":
          return order > 0;
        case "<=":
          return order <= 0;
        case "<":
          return order < 0;
        case "=":
          return order === 0;
        default:
          throw new Error(`engines.dsh 只支持 >=、>、<=、<、= 比较符，实际是 ${operator}`);
      }
    });
}

/**
 * The tags on the commit `references/deepseek-harness` has checked out.
 * @param rootDir - repository root.
 * @returns the tag names, or null when the submodule is not checked out.
 */
export function harnessTags(rootDir = root) {
  const harness = join(rootDir, "references/deepseek-harness");
  if (!existsSync(join(harness, ".git"))) return null;
  return execFileSync("git", ["-C", harness, "tag", "--points-at", "HEAD"], { encoding: "utf8" })
    .split("\n")
    .filter((tag) => tag !== "");
}

/**
 * Everything that must agree for the version source to hold: the catalog's dsh
 * version against `apps/host/supported-dsh.json` and the checked-out
 * `references/deepseek-harness` tag (skipped when the submodule is absent), every workspace package
 * against `"catalog:"` instead of a hand-written dsh pin, and every declared
 * `engines.dsh` range containing the catalog's version (a plugin that says it
 * supports a range the Host does not run is a lie the pins can catch).
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
  const tags = harnessTags(rootDir);
  if (tags !== null && !tags.includes(`dsh-v${pinned}`)) {
    problems.push(
      `references/deepseek-harness 检出的不是 dsh-v${pinned}（HEAD 上的 tag：${tags.join(", ") || "无"}）；` +
        `运行 git -C references/deepseek-harness fetch --tags && git -C references/deepseek-harness checkout dsh-v${pinned}`,
    );
  }
  for (const { name, path } of manifests(rootDir)) {
    if (path === join(rootDir, "package.json")) continue;
    const manifest = readJson(path);
    const engine = manifest.engines?.dsh;
    if (typeof engine === "string") {
      try {
        if (!inRange(pinned, engine)) {
          problems.push(
            `${name} 的 engines.dsh 是 ${engine}，不包含 catalog 的 dsh 版本 ${pinned}` +
              "（放宽区间，或升级 dsh 后同步这个上下界）",
          );
        }
      } catch (error) {
        problems.push(`${name} 的 engines.dsh 无法解析：${error.message}`);
      }
    }
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
