/**
 * Wire records of the `myaidBotPresets` Remote.
 *
 * This file is the plugin-owned source of truth; the Client mirrors these DTOs
 * in `@myaid/dsh-web-protocol/bot-presets` because plugins must not import that
 * Client-only package. Keep the two shapes in sync.
 */
import type {} from "@deepseek-ai/dsh-typert-protocol";

/** One skill bundle copied into a derived preset's private skill root. */
export type BotPresetSkill = {
  /** Kebab-case skill name, taken from the bundle's frontmatter when present. */
  name: string;
  /** Absolute source path the person selected. */
  path: string;
};

/** One plugin-row override in a derived preset. */
export type BotPresetPlugin = {
  /** The base row's entry id, or null when the declaration leaves it anonymous. */
  entryId: string | null;
  /** Module specifier the row names; used when the row has no entry id. */
  moduleName: string;
  /** Effective enablement the person chose. */
  enabled: boolean;
};

/** One Bot's derived preset as the Client reads it. */
export type BotPresetRecord = {
  /** Stable, namespaced preset id (`myaid-bot-…`). */
  presetId: string;
  /** Registry Bot that owns this derived preset. */
  botId: string;
  /** Preset whose composition was copied when the derived preset was created. */
  basePresetId: string;
  /** Display name in dsh's preset roster. */
  label: string;
  /** Skill bundles added on top of the base composition. */
  skills: readonly BotPresetSkill[];
  /** Plugin rows the person switched against the base composition. */
  plugins: readonly BotPresetPlugin[];
  /** Current activation diagnostic, when the preset cannot compose a Session. */
  broken?: string;
};

export type BotPresetDeriveRequest = {
  botId: string;
  /** Display label for the derived preset, normally the Bot's name. */
  label: string;
  /** Preset the Bot reads today (template's, or its own bound one). */
  basePresetId: string;
};

export type BotPresetUpdateRequest = {
  /** Complete replacement list of skill bundle paths; omit to leave unchanged. */
  skills?: readonly string[];
  /** Complete replacement list of plugin overrides; omit to leave unchanged. */
  plugins?: readonly BotPresetPlugin[];
};

export type BotPresetRemoveResult = { removed: boolean };

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface RemoteErrorDetailsMap {
    /** The id is not a derived preset this plugin owns. */
    "bot-preset/not-found": {
      readonly presetId: string;
      readonly available: readonly string[];
    };
    /** The request cannot produce a preset (missing base, bad row, bad skill). */
    "bot-preset/invalid": {
      readonly presetId: string;
      readonly reason: string;
    };
  }
}
