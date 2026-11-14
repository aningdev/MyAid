/**
 * `dsh-bot-presets`: the Host-side owner of Bot presets.
 *
 * dsh exposes `agentPresets.list/read/select` but no write surface: preset
 * bodies live in profile YAML. This plugin closes that gap for the product by
 * copying a base composition into a Bot-owned derived preset, persisting the
 * person's plugin/skill edits in dsh's storage domain, and contributing the
 * result through `ctx.agentPresets.register`. Session creation and the
 * official preset Remotes then see it like any other preset.
 */
import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import Schema from "@deepseek-ai/schemastery";

import { BotPresetsService } from "./service.ts";

export const PLUGIN_ID = "bot-presets";
export const name = PLUGIN_ID;

export const inject = ["agentPresets", "storageDomain"];

/** What a deployment may set on this plugin's row in `cordis.yml`. */
export interface Config {
  /**
   * Root of this plugin's own data: the storage backend that holds the derived
   * preset records, and the copied skill bundles beside it under `skills/`.
   * Empty means `$DSH_HOME/bot-presets`.
   */
  dataDir?: string;
}

export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string().description(
    "Root for the derived preset records and their copied skill bundles; empty means $DSH_HOME/bot-presets.",
  ),
});

/** Resolve the configured data root; the only default this plugin applies. */
function dataRoot(config: Config): string {
  const configured = config.dataDir?.trim() ?? "";
  return configured === "" ? join(resolveDshHome(), PLUGIN_ID) : configured;
}

export function apply(ctx: Context, config: Config): void {
  new BotPresetsService(ctx, { dataDir: dataRoot(config) });
}

export { BotPresetsService } from "./service.ts";
export { DERIVED_PREFIX, derivedPresetId } from "./ids.ts";
export type {
  BotPresetDeriveRequest,
  BotPresetPlugin,
  BotPresetRecord,
  BotPresetRemoveResult,
  BotPresetSkill,
  BotPresetUpdateRequest,
} from "./types.ts";
