/**
 * `myaid-plugin-bot-presets`: the Host-side owner of MyAid Bot presets.
 *
 * dsh exposes `agentPresets.list/read/select` but no write surface: preset
 * bodies live in profile YAML. This plugin closes that gap for the product by
 * copying a base composition into a Bot-owned derived preset, persisting the
 * person's plugin/skill edits in dsh's storage domain, and contributing the
 * result through `ctx.agentPresets.register`. Session creation and the
 * official preset Remotes then see it like any other preset.
 */
import type { Context } from "@deepseek-ai/cordis";

import { BotPresetsService } from "./service.ts";

export const PLUGIN_ID = "myaid-bot-presets";
export const name = PLUGIN_ID;

export const inject = ["agentPresets", "storageDomain"];

export function apply(ctx: Context): void {
  new BotPresetsService(ctx);
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
