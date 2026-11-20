/**
 * `dsh-bots`: the Host-side owner of the product Registry and Main Bot.
 *
 * The Registry (Bots, identity marks, segment ownership) and the Main Bot used
 * to live in the Desktop Client's file. They now live here, so every Device
 * reads and writes one copy through the `bots` Remote. Derived Bot presets —
 * the writable half of an Agent preset — live here too.
 */
import { join } from "node:path";

import type { Context } from "@deepseek-ai/cordis";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import Schema from "@deepseek-ai/schemastery";

import { BotsService } from "./service.ts";

export const PLUGIN_ID = "bots";
export const name = PLUGIN_ID;

export const inject = ["agentPresets", "storageDomain"];

/** What a deployment may set on this plugin's row in `cordis.yml`. */
export interface Config {
  /**
   * Root of this plugin's own data: the Registry file and the copied skill
   * bundles under `skills/`. Empty means `$DSH_HOME/bots`.
   */
  dataDir?: string;
}

export const Config: Schema<Config> = Schema.object({
  dataDir: Schema.string().description(
    "Root for the Registry file and the derived presets' copied skill bundles; empty means $DSH_HOME/bots.",
  ),
});

/** Resolve the configured data root; the only default this plugin applies. */
function dataRoot(config: Config): string {
  const configured = config.dataDir?.trim() ?? "";
  return configured === "" ? join(resolveDshHome(), PLUGIN_ID) : configured;
}

export function apply(ctx: Context, config: Config): void {
  const dataDir = dataRoot(config);
  new BotsService(ctx, {
    dataDir,
    registryFile: join(dataDir, "registry.json"),
  });
}

export {
  BotsService,
  type BotsServiceOptions,
  type BotRoute,
  type BotsRouting,
} from "./service.ts";
export type { BotsSnapshot } from "./store.ts";
export {
  MAIN_BOT_ID,
  MAIN_BOT_NAME,
  REGISTRY_VERSION,
  type Bot,
  type BotRegistry,
  type BotTemplate,
  type Segment,
} from "./registry.ts";
export { DERIVED_PREFIX, derivedPresetId } from "./ids.ts";
export type {
  DerivedPresetDeriveRequest,
  DerivedPresetPlugin,
  DerivedPresetRecord,
  DerivedPresetRemoveResult,
  DerivedPresetSkill,
  DerivedPresetUpdateRequest,
} from "./preset-types.ts";
