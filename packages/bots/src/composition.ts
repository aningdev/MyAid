/**
 * The preset body: copy a base composition from dsh's `agentPresets.read`
 * YAML, then apply the plugin's two edits (plugin-row overrides and a private
 * skill root) without rebuilding the base rows.
 *
 * `read` renders the Loader's own dialect, `!!js` conditions included; parsing
 * and dumping with the same `entryListSchema` keeps those expressions intact.
 */
import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import type { PresetDefinition } from "@deepseek-ai/dsh-agent-preset-registry";
import { dump, load } from "js-yaml";

import type { DerivedPresetPlugin } from "./preset-types.ts";

/** One child plugin row as dsh's registry declares it. */
export type PluginRow = PresetDefinition["plugins"][number];

/** Row id this plugin owns when it adds the private skill provider. */
export const SKILL_ROW_ID = "bots-skills";

/** Provider name the private skill root registers under. */
export const SKILL_PROVIDER = "bots-skills";

/** Parse the YAML `agentPresets.read` returns. */
export function decodeComposition(content: string): PluginRow[] {
  const parsed = load(content, { schema: entryListSchema });
  if (!Array.isArray(parsed)) {
    throw new Error("preset 正文不是插件行列表");
  }
  for (const row of parsed) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new Error("preset 正文里有非插件行");
    }
    const name = (row as { name?: unknown }).name;
    if (typeof name !== "string" || name === "") {
      throw new Error("preset 正文里有未命名插件行");
    }
  }
  return parsed as PluginRow[];
}

/** Render rows with the Loader's own dialect (`!!js` preserved). */
export function encodeComposition(rows: readonly PluginRow[]): string {
  return dump(rows, { schema: entryListSchema, noRefs: true, lineWidth: -1 });
}

/** Stable key for one base row: its id when declared, else its module name. */
export function rowKey(row: Pick<PluginRow, "id" | "name">): string {
  return typeof row.id === "string" && row.id !== "" ? `id:${row.id}` : `name:${row.name}`;
}

/**
 * One row with the id path the Loader gives it (`planning:plan-mode`).
 * Groups contribute their nested rows; the path is what `pluginInventory`
 * reports as `entryId` for a mounted preset.
 */
type RowAtPath = { row: PluginRow; path: string };

function rowsWithPaths(rows: readonly PluginRow[], prefix = ""): RowAtPath[] {
  const found: RowAtPath[] = [];
  for (const row of rows) {
    const own = `${prefix}${typeof row.id === "string" && row.id !== "" ? row.id : row.name}`;
    found.push({ row, path: own });
    if (row.group === true && Array.isArray(row.config)) {
      found.push(...rowsWithPaths(row.config as PluginRow[], `${own}:`));
    }
  }
  return found;
}

/**
 * Validate one override against the base body before it is stored.
 * @returns the row the override addresses.
 */
export function resolveOverride(
  rows: readonly PluginRow[],
  override: DerivedPresetPlugin,
): PluginRow {
  const all = rowsWithPaths(rows);
  let found = all.filter(({ path }) => override.entryId !== null && path === override.entryId);
  // An anonymous group's generated Loader id is not in the base YAML; fall
  // back to the module name when that row is unambiguous.
  if (found.length === 0 && (override.entryId === null || override.entryId.includes(":"))) {
    found = all.filter(({ row }) => row.name === override.moduleName);
  }
  if (found.length === 0) {
    throw new Error(
      `base preset 没有插件行 ${override.entryId ?? override.moduleName}（${override.moduleName}）`,
    );
  }
  if (found.length > 1) {
    throw new Error(`插件行 ${override.moduleName} 不唯一；请用 entryId 指定要切换的那一行`);
  }
  const match = found[0];
  if (match === undefined) throw new Error("插件行解析失败");
  if (match.row.group === true) throw new Error(`不能切换分组行 ${override.moduleName}`);
  return match.row;
}

/** Apply the complete override list to a freshly parsed base body. */
export function applyPluginOverrides(
  rows: PluginRow[],
  overrides: readonly DerivedPresetPlugin[],
): PluginRow[] {
  for (const override of overrides) {
    const row = resolveOverride(rows, override);
    row.disabled = !override.enabled;
  }
  return rows;
}

/** Whether the base composition (including nested groups) mounts the skill surface. */
export function hasSkillSurface(rows: readonly PluginRow[]): boolean {
  const names = new Set(rowsWithPaths(rows).map(({ row }) => row.name));
  return names.has("@deepseek-ai/dsh-skill") && names.has("@deepseek-ai/dsh-tool-skill");
}

/**
 * Replace this plugin's private skill provider row with one rooted at `skillRoot`.
 * An empty selection removes the row; the base composition stays untouched.
 */
export function applySkillProvider(rows: PluginRow[], skillRoot: string | null): PluginRow[] {
  const kept = rows.filter((row) => row.id !== SKILL_ROW_ID);
  if (skillRoot === null) return kept;
  kept.push({
    id: SKILL_ROW_ID,
    name: "@deepseek-ai/dsh-skill-filesystem",
    config: {
      providerName: SKILL_PROVIDER,
      includeDefaultRoots: false,
      customSkillDirs: [skillRoot],
    },
  });
  return kept;
}
