/**
 * Wire records of the `bots` Remote.
 *
 * This file is the plugin-owned source of truth; the Client mirrors these DTOs
 * in `@dsh-bot/dsh-web-protocol/bots` because plugins must not import that
 * Client-only package. Keep the two shapes in sync.
 */
import type {} from "@deepseek-ai/dsh-typert-protocol";

/** One skill bundle copied into a derived preset's private skill root. */
export type DerivedPresetSkill = {
  /** Kebab-case skill name, taken from the bundle's frontmatter when present. */
  name: string;
  /** Absolute source path the person selected. */
  path: string;
};

/** One plugin-row override in a derived preset. */
export type DerivedPresetPlugin = {
  /** The base row's entry id, or null when the declaration leaves it anonymous. */
  entryId: string | null;
  /** Module specifier the row names; used when the row has no entry id. */
  moduleName: string;
  /** Effective enablement the person chose. */
  enabled: boolean;
};

/** One Bot's derived preset as the Client reads it. */
export type DerivedPresetRecord = {
  /** Stable, namespaced preset id (`bots-…`). */
  presetId: string;
  /** Registry Bot that owns this derived preset. */
  botId: string;
  /** Preset whose composition was copied when the derived preset was created. */
  basePresetId: string;
  /** Display name in dsh's preset roster. */
  label: string;
  /** Skill bundles added on top of the base composition. */
  skills: readonly DerivedPresetSkill[];
  /** Plugin rows the person switched against the base composition. */
  plugins: readonly DerivedPresetPlugin[];
  /** Current activation diagnostic, when the preset cannot compose a Session. */
  broken?: string;
};

export type DerivedPresetDeriveRequest = {
  botId: string;
  /** Display label for the derived preset, normally the Bot's name. */
  label: string;
  /** Preset the Bot reads today (template's, or its own bound one). */
  basePresetId: string;
};

export type DerivedPresetUpdateRequest = {
  /** Complete replacement list of skill bundle paths; omit to leave unchanged. */
  skills?: readonly string[];
  /** Complete replacement list of plugin overrides; omit to leave unchanged. */
  plugins?: readonly DerivedPresetPlugin[];
};

export type DerivedPresetDeriveResult = { presetId: string };

export type DerivedPresetRemoveResult = { removed: boolean };

declare module "@deepseek-ai/dsh-typert-protocol" {
  interface RemoteErrorDetailsMap {
    /** The id is not a derived preset this plugin owns. */
    "bots/preset-not-found": {
      readonly presetId: string;
      readonly available: readonly string[];
    };
    /** The request cannot produce a preset (missing base, bad row, bad skill). */
    "bots/preset-invalid": {
      readonly presetId: string;
      readonly reason: string;
    };
  }
}
