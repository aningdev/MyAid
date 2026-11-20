/**
 * Derived Bot presets: the writable half of a Bot's Agent preset.
 *
 * `derive` copies a base composition from the official registry; `update`
 * stores complete plugin-row and skill selections; every change re-registers
 * the preset through `ctx.agentPresets`, so dsh's own `agentPresets.list/read/
 * select` and Session creation see it. Records live in this plugin's `bots`
 * storage domain; the private skill copies live under the plugin's data root
 * (`$DSH_HOME/bots` unless configured).
 */
import type { Context } from "@deepseek-ai/cordis";
import type { KvTable } from "@deepseek-ai/dsh-storage-domain";
import { RemoteError } from "@deepseek-ai/dsh-typert-protocol";

import {
  applyPluginOverrides,
  applySkillProvider,
  decodeComposition,
  hasSkillSurface,
  resolveOverride,
  type PluginRow,
} from "./composition.ts";
import { presetsDomainSpec, publicRecord, type StoredPreset } from "./domain.ts";
import { derivedPresetId } from "./ids.ts";
import type {
  DerivedPresetDeriveRequest,
  DerivedPresetPlugin,
  DerivedPresetRecord,
  DerivedPresetRemoveResult,
  DerivedPresetUpdateRequest,
} from "./preset-types.ts";
import { materializeSkills, removeSkillRoot, skillRoot } from "./skills.ts";

/** One Bot's preset as the Host currently stores it. */
export class DerivedPresets {
  private readonly ctx: Context;
  private readonly dataDir: string;
  readonly ready: Promise<void>;
  private readonly unregisters = new Map<string, () => Promise<void>>();
  private readonly broken = new Map<string, string>();
  private table?: KvTable<string, StoredPreset>;

  constructor(ctx: Context, options: { dataDir: string }) {
    this.ctx = ctx;
    this.dataDir = options.dataDir;
    this.ready = this.start();
    // A failed open must not become an unhandled rejection; the first Remote
    // call reports the same failure to the person.
    this.ready.catch(() => undefined);
  }

  private async start(): Promise<void> {
    const domain = await this.ctx.storageDomain.open(presetsDomainSpec);
    this.ctx.effect(() => () => domain.close(), "bots.presets.domain");
    this.table = domain.table("presets");
    for (const [presetId, stored] of this.table.entries()) {
      try {
        await this.registerStored(stored);
      } catch (error) {
        const reason = messageOf(error);
        this.broken.set(presetId, reason);
        this.ctx.logger.warn(`bots: 派生 preset ${presetId} 无法装配：${reason}`);
      }
    }
  }

  /** Copy a Bot's current preset into its own derived preset. */
  async derive(request: DerivedPresetDeriveRequest): Promise<{ presetId: string }> {
    await this.ready;
    const existing = this.recordForBot(request.botId);
    if (existing !== undefined) return { presetId: existing.presetId };
    const baseYaml = await this.readBase(request.basePresetId);
    const presetId = derivedPresetId(request.botId);
    if (this.table?.get(presetId) !== undefined || this.unregisters.has(presetId)) {
      throw invalid(presetId, "派生 preset id 已存在，不能重复创建。");
    }
    const stored: StoredPreset = {
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
  async read(presetId: string): Promise<DerivedPresetRecord> {
    await this.ready;
    const stored = this.requireTable().get(presetId);
    if (stored === undefined) throw notFound(presetId, this.knownIds());
    return publicRecord(stored, this.broken.get(presetId));
  }

  /** Replace the saved skill and plugin selections; omitted fields stay as saved. */
  async update(presetId: string, patch: DerivedPresetUpdateRequest): Promise<DerivedPresetRecord> {
    await this.ready;
    const stored = this.requireTable().get(presetId);
    if (stored === undefined) throw notFound(presetId, this.knownIds());

    const baseRows = decodeComposition(stored.baseYaml);
    const plugins =
      patch.plugins === undefined ? stored.plugins : validatedOverrides(baseRows, patch.plugins);
    if ((patch.skills?.length ?? 0) > 0 && !hasSkillSurface(baseRows)) {
      throw invalid(
        presetId,
        "base preset 没有挂载技能注册表（dsh-skill / dsh-tool-skill），不能添加技能。",
      );
    }

    const skills =
      patch.skills === undefined
        ? stored.skills
        : await this.materialize(presetId, patch.skills, false);
    const next: StoredPreset = { ...stored, plugins, skills, updatedAt: Date.now() };

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
  async remove(presetId: string): Promise<DerivedPresetRemoveResult> {
    await this.ready;
    const stored = this.requireTable().get(presetId);
    if (stored === undefined) return { removed: false };
    await this.unregister(presetId);
    await this.requireTable().delete(presetId);
    await removeSkillRoot(this.dataDir, presetId);
    this.broken.delete(presetId);
    return { removed: true };
  }

  private async readBase(basePresetId: string): Promise<string> {
    try {
      const document = await this.ctx.agentPresets.readDocument(basePresetId);
      return document.content;
    } catch (error) {
      throw invalid(basePresetId, `读不到 base preset ${basePresetId}：${messageOf(error)}`);
    }
  }

  private recordForBot(botId: string): StoredPreset | undefined {
    for (const [, stored] of this.requireTable().entries()) {
      if (stored.botId === botId) return stored;
    }
    return undefined;
  }

  private knownIds(): readonly string[] {
    return [...this.requireTable().keys()].sort((a, b) => a.localeCompare(b));
  }

  private requireTable(): KvTable<string, StoredPreset> {
    if (this.table === undefined) throw invalid("", "派生 preset 存储尚未就绪。");
    return this.table;
  }

  private async materialize(presetId: string, paths: readonly string[], tolerateMissing: boolean) {
    return materializeSkills(this.dataDir, presetId, paths, { tolerateMissing });
  }

  private async registerStored(stored: StoredPreset): Promise<void> {
    const rows = decodeComposition(stored.baseYaml);
    applyPluginOverrides(rows, stored.plugins);
    const available = await this.materialize(
      stored.presetId,
      stored.skills.map((skill) => skill.path),
      true,
    );
    if (available.length > 0 && !hasSkillSurface(rows)) {
      throw invalid(stored.presetId, "base preset 没有挂载技能注册表，不能装配已添加的技能。");
    }
    applySkillProvider(
      rows,
      available.length > 0 ? skillRoot(this.dataDir, stored.presetId) : null,
    );
    await this.unregister(stored.presetId);
    try {
      const unregister = await this.ctx.agentPresets.register({
        id: stored.presetId,
        name: stored.label,
        description: `Bot preset derived from ${stored.basePresetId}`,
        plugins: rows,
      });
      this.unregisters.set(stored.presetId, unregister);
      // Cordis owns the registration's lifetime, like the official
      // `@deepseek-ai/dsh-agent-preset` declaration row.
      this.ctx.effect(() => unregister, `bots.presets:${stored.presetId}`);
      this.broken.delete(stored.presetId);
    } catch (error) {
      throw invalid(stored.presetId, `装配派生 preset 失败：${messageOf(error)}`);
    }
  }

  /** Best-effort return to the last saved state after a failed update. */
  private async restore(stored: StoredPreset): Promise<void> {
    try {
      await this.registerStored(stored);
    } catch (error) {
      const reason = messageOf(error);
      this.broken.set(stored.presetId, reason);
      this.ctx.logger.warn(`bots: 回滚 ${stored.presetId} 失败：${reason}`);
    }
    await this.materialize(
      stored.presetId,
      stored.skills.map((skill) => skill.path),
      true,
    ).catch(() => undefined);
  }

  private async unregister(presetId: string): Promise<void> {
    const dispose = this.unregisters.get(presetId);
    if (dispose === undefined) return;
    this.unregisters.delete(presetId);
    await dispose();
  }
}

function validatedOverrides(
  rows: readonly PluginRow[],
  overrides: readonly DerivedPresetPlugin[],
): DerivedPresetPlugin[] {
  const seen = new Set<string>();
  for (const override of overrides) {
    resolveOverride(rows, override);
    const key = override.entryId ?? override.moduleName;
    if (seen.has(key)) throw invalid(key, `插件行 ${key} 重复切换。`);
    seen.add(key);
  }
  return [...overrides];
}

function invalid(presetId: string, reason: string): RemoteError<"bots/preset-invalid"> {
  return new RemoteError("bots/preset-invalid", reason, { presetId, reason });
}

function notFound(
  presetId: string,
  available: readonly string[],
): RemoteError<"bots/preset-not-found"> {
  return new RemoteError("bots/preset-not-found", `没有派生 preset ${presetId}。`, {
    presetId,
    available,
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
