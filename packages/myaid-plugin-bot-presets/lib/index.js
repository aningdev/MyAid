import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { basename, isAbsolute, join } from "node:path";

import { entryListSchema } from "@deepseek-ai/cordis-plugin-include";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { defineDomain, domainTable } from "@deepseek-ai/dsh-storage-domain";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { load } from "js-yaml";
import { z } from "zod";

import { r as botPresetRecordSchema } from "./wire-CDP061LT.js";
// src/composition.ts
/**
 * The preset body: copy a base composition from dsh's `agentPresets.read`
 * YAML, then apply MyAid's two edits (plugin-row overrides and a private skill
 * root) without rebuilding the base rows.
 *
 * `read` renders the Loader's own dialect, `!!js` conditions included; parsing
 * and dumping with the same `entryListSchema` keeps those expressions intact.
 */
/** Row id MyAid owns when it adds the private skill provider. */
const SKILL_ROW_ID = "myaid-bot-skills";
/** Provider name the private skill root registers under. */
const SKILL_PROVIDER = "myaid-bot-skills";
/** Parse the YAML `agentPresets.read` returns. */
function decodeComposition(content) {
  const parsed = load(content, { schema: entryListSchema });
  if (!Array.isArray(parsed)) throw new Error("preset 正文不是插件行列表");
  for (const row of parsed) {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      throw new Error("preset 正文里有非插件行");
    const name = row.name;
    if (typeof name !== "string" || name === "") throw new Error("preset 正文里有未命名插件行");
  }
  return parsed;
}
function rowsWithPaths(rows, prefix = "") {
  const found = [];
  for (const row of rows) {
    const own = `${prefix}${typeof row.id === "string" && row.id !== "" ? row.id : row.name}`;
    found.push({
      row,
      path: own,
    });
    if (row.group === true && Array.isArray(row.config))
      found.push(...rowsWithPaths(row.config, `${own}:`));
  }
  return found;
}
/**
 * Validate one override against the base body before it is stored.
 * @returns the row the override addresses.
 */
function resolveOverride(rows, override) {
  const all = rowsWithPaths(rows);
  let found = all.filter(({ path }) => override.entryId !== null && path === override.entryId);
  if (found.length === 0 && (override.entryId === null || override.entryId.includes(":")))
    found = all.filter(({ row }) => row.name === override.moduleName);
  if (found.length === 0)
    throw new Error(
      `base preset 没有插件行 ${override.entryId ?? override.moduleName}（${override.moduleName}）`,
    );
  if (found.length > 1)
    throw new Error(`插件行 ${override.moduleName} 不唯一；请用 entryId 指定要切换的那一行`);
  const match = found[0];
  if (match === void 0) throw new Error("插件行解析失败");
  if (match.row.group === true) throw new Error(`不能切换分组行 ${override.moduleName}`);
  return match.row;
}
/** Apply the complete override list to a freshly parsed base body. */
function applyPluginOverrides(rows, overrides) {
  for (const override of overrides) {
    const row = resolveOverride(rows, override);
    row.disabled = !override.enabled;
  }
  return rows;
}
/** Whether the base composition (including nested groups) mounts the skill surface. */
function hasSkillSurface(rows) {
  const names = new Set(rowsWithPaths(rows).map(({ row }) => row.name));
  return names.has("@deepseek-ai/dsh-skill") && names.has("@deepseek-ai/dsh-tool-skill");
}
/**
 * Replace MyAid's private skill provider row with one rooted at `skillRoot`.
 * An empty selection removes the row; the base composition stays untouched.
 */
function applySkillProvider(rows, skillRoot) {
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
// src/domain.ts
/** Storage domain for derived presets: one record per Bot-owned preset. */
/** Domain name; also the backend unit name under `$DSH_HOME/storages`. */
const DOMAIN_NAME = "myaid_bot_presets";
/** The stored record adds the copied base body, which is not a Client DTO. */
const storedPresetSchema = botPresetRecordSchema.extend({
  /** Base composition YAML captured by `derive`; the derived preset's body. */
  baseYaml: z.string(),
  /** Host epoch milliseconds of the last update. */
  updatedAt: z.number(),
});
const botPresetsDomainSpec = defineDomain({
  name: DOMAIN_NAME,
  version: 1,
  tables: { presets: domainTable(storedPresetSchema) },
});
/** Strip the body before a record crosses the Remote boundary. */
function publicRecord(stored, broken) {
  return {
    presetId: stored.presetId,
    botId: stored.botId,
    basePresetId: stored.basePresetId,
    label: stored.label,
    skills: stored.skills,
    plugins: stored.plugins,
    ...(broken === void 0 ? {} : { broken }),
  };
}
// src/ids.ts
/** Stable, namespaced identity for one Bot's derived preset. */
/** Every derived preset id starts with this namespace. */
const DERIVED_PREFIX = "myaid-bot-";
/**
 * Stable id for one Bot. The digest keeps ids distinct even when two Bot ids
 * sanitize to the same prefix; a derived preset never collides with a profile
 * preset because of the `myaid-bot-` namespace.
 */
function derivedPresetId(botId) {
  const trimmed = botId.trim();
  if (trimmed === "") throw new Error("Bot id 不能为空。");
  const safe = trimmed.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
  const digest = createHash("sha256").update(trimmed).digest("hex").slice(0, 8);
  return `${DERIVED_PREFIX}${safe.slice(0, 48) || "bot"}-${digest}`;
}
// src/skills.ts
/**
 * Private skill bundles for one derived preset.
 *
 * A preset's skill provider only takes directories, and dsh's filesystem
 * provider has no per-skill exclusion. MyAid therefore copies the person's
 * selected bundles into `$DSH_HOME/myaid-plugin-bot-presets/skills/<presetId>`
 * and mounts that directory as an extra provider. Copying (not symlinking)
 * keeps Windows working and leaves the base composition's skills untouched.
 */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Directory holding every derived preset's copied skill bundles. */
function skillsDirectory(dataDir) {
  return join(dataDir, "skills");
}
/** One derived preset's private skill root. */
function skillRoot(dataDir, presetId) {
  return join(skillsDirectory(dataDir), presetId);
}
/** Read a skill bundle's declared name, falling back to its path segment. */
async function readSkillName(path) {
  const info = await stat(path);
  const file = info.isDirectory() ? join(path, "SKILL.md") : path;
  if (!info.isDirectory() && !info.isFile())
    throw new Error(`技能路径不是目录或 Markdown 文件：${path}`);
  const text = await readFile(file, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (frontmatter !== null) {
    const parsed = load(frontmatter[1] ?? "");
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const name = parsed.name;
      if (typeof name === "string" && SKILL_NAME.test(name)) return name;
    }
  }
  const fallback = info.isDirectory() ? basename(path) : basename(path).replace(/\.md$/i, "");
  if (!SKILL_NAME.test(fallback)) throw new Error(`技能名不是 kebab-case：${fallback}（${path}）`);
  return fallback;
}
/**
 * Replace a derived preset's private skill root with copies of `paths`.
 * @returns the skill records stored beside the preset.
 */
async function materializeSkills(dataDir, presetId, paths, options = {}) {
  const root = skillRoot(dataDir, presetId);
  await rm(root, {
    recursive: true,
    force: true,
  });
  if (paths.length === 0) return [];
  await mkdir(root, { recursive: true });
  const records = [];
  const seen = /* @__PURE__ */ new Set();
  for (const path of paths) {
    if (!isAbsolute(path)) throw new Error(`技能路径必须是绝对路径：${path}`);
    let name;
    let info;
    try {
      name = await readSkillName(path);
      info = await stat(path);
    } catch (error) {
      if (options.tolerateMissing === true && isMissing(error)) continue;
      throw error;
    }
    if (seen.has(name)) throw new Error(`技能名重复：${name}`);
    seen.add(name);
    if (info.isDirectory()) await cp(path, join(root, name), { recursive: true });
    else await copyFile(path, join(root, `${name}.md`));
    records.push({
      name,
      path,
    });
  }
  return records;
}
function isMissing(error) {
  return typeof error === "object" && error !== null && error.code === "ENOENT";
}
/** Drop a derived preset's private skill root. */
async function removeSkillRoot(dataDir, presetId) {
  await rm(skillRoot(dataDir, presetId), {
    recursive: true,
    force: true,
  });
}
// src/service.ts
/**
 * The Host-side owner of derived Bot presets.
 *
 * `derive` copies a base composition from the official registry; `update`
 * stores complete plugin-row and skill selections; every change re-registers
 * the preset through `ctx.agentPresets`, so dsh's own `agentPresets.list/read/
 * select` and Session creation see it. Records live in the `myaid_bot_presets`
 * storage domain; the private skill copies live under `$DSH_HOME`.
 */
/** One Bot's preset as the Host currently stores it. */
var BotPresetsService = class extends TypertRemoteService {
  static inject = ["agentPresets", "storageDomain"];
  dataDir = join(resolveDshHome(), "myaid-plugin-bot-presets");
  ready;
  unregisters = /* @__PURE__ */ new Map();
  broken = /* @__PURE__ */ new Map();
  table;
  constructor(ctx) {
    super(ctx, "myaidBotPresets");
    this.ready = this.start();
    this.ready.catch(() => void 0);
  }
  async start() {
    const domain = await this.ctx.storageDomain.open(botPresetsDomainSpec);
    this.ctx.effect(() => () => domain.close(), "myaid-bot-presets.domain");
    this.table = domain.table("presets");
    for (const [presetId, stored] of this.table.entries())
      try {
        await this.registerStored(stored);
      } catch (error) {
        const reason = messageOf(error);
        this.broken.set(presetId, reason);
        this.ctx.logger.warn(`myaid-bot-presets: 派生 preset ${presetId} 无法装配：${reason}`);
      }
  }
  /** Copy a Bot's current preset into its own derived preset. */
  async derive(request) {
    await this.ready;
    const existing = this.recordForBot(request.botId);
    if (existing !== void 0) return { presetId: existing.presetId };
    const baseYaml = await this.readBase(request.basePresetId);
    const presetId = derivedPresetId(request.botId);
    if (this.table?.get(presetId) !== void 0 || this.unregisters.has(presetId))
      throw invalid(presetId, "派生 preset id 已存在，不能重复创建。");
    const stored = {
      presetId,
      botId: request.botId,
      basePresetId: request.basePresetId,
      label: request.label.trim() || request.botId,
      skills: [],
      plugins: [],
      baseYaml,
      updatedAt: Date.now(),
    };
    try {
      await this.registerStored(stored);
      await this.requireTable().put(presetId, stored);
    } catch (error) {
      await this.unregister(presetId);
      throw error instanceof RemoteError ? error : invalid(presetId, messageOf(error));
    }
    return { presetId };
  }
  /** Read one derived preset's saved state. */
  async read(presetId) {
    await this.ready;
    const stored = this.requireTable().get(presetId);
    if (stored === void 0) throw notFound(presetId, this.knownIds());
    return publicRecord(stored, this.broken.get(presetId));
  }
  /** Replace the saved skill and plugin selections; omitted fields stay as saved. */
  async update(presetId, patch) {
    await this.ready;
    const stored = this.requireTable().get(presetId);
    if (stored === void 0) throw notFound(presetId, this.knownIds());
    const baseRows = decodeComposition(stored.baseYaml);
    const plugins =
      patch.plugins === void 0 ? stored.plugins : validatedOverrides(baseRows, patch.plugins);
    if ((patch.skills?.length ?? 0) > 0 && !hasSkillSurface(baseRows))
      throw invalid(
        presetId,
        "base preset 没有挂载技能注册表（dsh-skill / dsh-tool-skill），不能添加技能。",
      );
    const skills =
      patch.skills === void 0
        ? stored.skills
        : await this.materialize(presetId, patch.skills, false);
    const next = {
      ...stored,
      plugins,
      skills,
      updatedAt: Date.now(),
    };
    try {
      await this.registerStored(next);
    } catch (error) {
      await this.restore(stored);
      throw error instanceof RemoteError ? error : invalid(presetId, messageOf(error));
    }
    try {
      await this.requireTable().put(presetId, next);
    } catch (error) {
      await this.restore(stored);
      throw invalid(presetId, `保存派生 preset 失败：${messageOf(error)}`);
    }
    return publicRecord(next, this.broken.get(presetId));
  }
  /** Remove one derived preset and its private skill copies. */
  async remove(presetId) {
    await this.ready;
    if (this.requireTable().get(presetId) === void 0) return { removed: false };
    await this.unregister(presetId);
    await this.requireTable().delete(presetId);
    await removeSkillRoot(this.dataDir, presetId);
    this.broken.delete(presetId);
    return { removed: true };
  }
  async readBase(basePresetId) {
    try {
      return (await this.ctx.agentPresets.readDocument(basePresetId)).content;
    } catch (error) {
      throw invalid(basePresetId, `读不到 base preset ${basePresetId}：${messageOf(error)}`);
    }
  }
  recordForBot(botId) {
    for (const [, stored] of this.requireTable().entries())
      if (stored.botId === botId) return stored;
  }
  knownIds() {
    return [...this.requireTable().keys()].sort((a, b) => a.localeCompare(b));
  }
  requireTable() {
    if (this.table === void 0) throw invalid("", "派生 preset 存储尚未就绪。");
    return this.table;
  }
  async materialize(presetId, paths, tolerateMissing) {
    return materializeSkills(this.dataDir, presetId, paths, { tolerateMissing });
  }
  async registerStored(stored) {
    const rows = decodeComposition(stored.baseYaml);
    applyPluginOverrides(rows, stored.plugins);
    const available = await this.materialize(
      stored.presetId,
      stored.skills.map((skill) => skill.path),
      true,
    );
    if (available.length > 0 && !hasSkillSurface(rows))
      throw invalid(stored.presetId, "base preset 没有挂载技能注册表，不能装配已添加的技能。");
    applySkillProvider(
      rows,
      available.length > 0 ? skillRoot(this.dataDir, stored.presetId) : null,
    );
    await this.unregister(stored.presetId);
    try {
      const unregister = await this.ctx.agentPresets.register({
        id: stored.presetId,
        name: stored.label,
        description: `MyAid Bot preset derived from ${stored.basePresetId}`,
        plugins: rows,
      });
      this.unregisters.set(stored.presetId, unregister);
      this.ctx.effect(() => unregister, `myaid-bot-presets.preset:${stored.presetId}`);
      this.broken.delete(stored.presetId);
    } catch (error) {
      throw invalid(stored.presetId, `装配派生 preset 失败：${messageOf(error)}`);
    }
  }
  /** Best-effort return to the last saved state after a failed update. */
  async restore(stored) {
    try {
      await this.registerStored(stored);
    } catch (error) {
      const reason = messageOf(error);
      this.broken.set(stored.presetId, reason);
      this.ctx.logger.warn(`myaid-bot-presets: 回滚 ${stored.presetId} 失败：${reason}`);
    }
    await this.materialize(
      stored.presetId,
      stored.skills.map((skill) => skill.path),
      true,
    ).catch(() => void 0);
  }
  async unregister(presetId) {
    const dispose = this.unregisters.get(presetId);
    if (dispose === void 0) return;
    this.unregisters.delete(presetId);
    await dispose();
  }
};
for (const [method, exportName] of [
  ["derive", "derive"],
  ["read", "read"],
  ["update", "update"],
  ["remove", "discard"],
])
  markRemoteMethod(BotPresetsService.prototype, method, exportName);
function markRemoteMethod(prototype, method, exportName) {
  const member = prototype[method];
  if (typeof member !== "function")
    throw new TypeError(`myaid-bot-presets: ${method} is not a method`);
  const context = {
    kind: "method",
    name: method,
    static: false,
    private: false,
    access: {
      has: () => true,
      get: () => void 0,
    },
    addInitializer(initializer) {
      initializer.call(Object.create(prototype));
    },
    metadata: {},
  };
  Remote(exportName)(member, context);
}
function validatedOverrides(rows, overrides) {
  const seen = /* @__PURE__ */ new Set();
  for (const override of overrides) {
    resolveOverride(rows, override);
    const key = override.entryId ?? override.moduleName;
    if (seen.has(key)) throw invalid(key, `插件行 ${key} 重复切换。`);
    seen.add(key);
  }
  return [...overrides];
}
function invalid(presetId, reason) {
  return new RemoteError("bot-preset/invalid", reason, {
    presetId,
    reason,
  });
}
function notFound(presetId, available) {
  return new RemoteError("bot-preset/not-found", `没有派生 preset ${presetId}。`, {
    presetId,
    available,
  });
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
// src/index.ts
const PLUGIN_ID = "myaid-bot-presets";
const name = PLUGIN_ID;
const inject = ["agentPresets", "storageDomain"];
function apply(ctx) {
  new BotPresetsService(ctx);
}
export { BotPresetsService, DERIVED_PREFIX, PLUGIN_ID, apply, derivedPresetId, inject, name };
