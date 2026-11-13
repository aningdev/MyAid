/**
 * Wire DTOs of `myaid-plugin-bot-presets`' `myaidBotPresets` Remote.
 *
 * Client-side types only: the plugin owns the same shapes in its own source and
 * must not depend on this package.
 */

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
  presetId: string;
  botId: string;
  basePresetId: string;
  label: string;
  skills: readonly BotPresetSkill[];
  plugins: readonly BotPresetPlugin[];
  broken?: string;
};

export type BotPresetDeriveRequest = {
  botId: string;
  label: string;
  basePresetId: string;
};

export type BotPresetDeriveResult = { presetId: string };

export type BotPresetUpdateRequest = {
  /** Complete replacement list of skill bundle paths; omit to leave unchanged. */
  skills?: readonly string[];
  /** Complete replacement list of plugin overrides; omit to leave unchanged. */
  plugins?: readonly BotPresetPlugin[];
};

export type BotPresetRemoveResult = { removed: boolean };
