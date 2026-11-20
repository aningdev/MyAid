/**
 * Private skill bundles for one derived preset.
 *
 * A preset's skill provider only takes directories, and dsh's filesystem
 * provider has no per-skill exclusion. The plugin therefore copies the person's
 * selected bundles into `<dataDir>/skills/<presetId>` (by default
 * `$DSH_HOME/bots/skills/<presetId>`) and mounts that directory as an
 * extra provider. Copying (not symlinking)
 * keeps Windows working and leaves the base composition's skills untouched.
 */
import { cp, copyFile, mkdir, readFile, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";

import { load } from "js-yaml";

import type { DerivedPresetSkill } from "./preset-types.ts";

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Directory holding every derived preset's copied skill bundles. */
export function skillsDirectory(dataDir: string): string {
  return join(dataDir, "skills");
}

/** One derived preset's private skill root. */
export function skillRoot(dataDir: string, presetId: string): string {
  return join(skillsDirectory(dataDir), presetId);
}

/** Read a skill bundle's declared name, falling back to its path segment. */
export async function readSkillName(path: string): Promise<string> {
  const info = await stat(path);
  const file = info.isDirectory() ? join(path, "SKILL.md") : path;
  if (!info.isDirectory() && !info.isFile()) {
    throw new Error(`技能路径不是目录或 Markdown 文件：${path}`);
  }
  const text = await readFile(file, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (frontmatter !== null) {
    const parsed = load(frontmatter[1] ?? "");
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const name = (parsed as { name?: unknown }).name;
      if (typeof name === "string" && SKILL_NAME.test(name)) return name;
    }
  }
  const fallback = info.isDirectory() ? basename(path) : basename(path).replace(/\.md$/i, "");
  if (!SKILL_NAME.test(fallback)) {
    throw new Error(`技能名不是 kebab-case：${fallback}（${path}）`);
  }
  return fallback;
}

/**
 * Replace a derived preset's private skill root with copies of `paths`.
 * @returns the skill records stored beside the preset.
 */
export async function materializeSkills(
  dataDir: string,
  presetId: string,
  paths: readonly string[],
  options: { tolerateMissing?: boolean } = {},
): Promise<DerivedPresetSkill[]> {
  const root = skillRoot(dataDir, presetId);
  await rm(root, { recursive: true, force: true });
  if (paths.length === 0) return [];
  await mkdir(root, { recursive: true });
  const records: DerivedPresetSkill[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (!isAbsolute(path)) throw new Error(`技能路径必须是绝对路径：${path}`);
    let name: string;
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      name = await readSkillName(path);
      info = await stat(path);
    } catch (error) {
      if (options.tolerateMissing === true && isMissing(error)) continue;
      throw error;
    }
    if (seen.has(name)) throw new Error(`技能名重复：${name}`);
    seen.add(name);
    if (info.isDirectory()) {
      await cp(path, join(root, name), { recursive: true });
    } else {
      await copyFile(path, join(root, `${name}.md`));
    }
    records.push({ name, path });
  }
  return records;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ENOENT"
  );
}

/** Drop a derived preset's private skill root. */
export async function removeSkillRoot(dataDir: string, presetId: string): Promise<void> {
  await rm(skillRoot(dataDir, presetId), { recursive: true, force: true });
}
