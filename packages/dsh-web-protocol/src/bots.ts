/**
 * Wire DTOs of `dsh-bots`' `bots` Remote.
 *
 * Client-side types only: the plugin owns the same shapes in its own source and
 * must not depend on this package.
 */

/** A Bot's identity mark: accent color, body shape and face. */
export type BotIdentity = {
  color: "indigo" | "sky" | "teal" | "lime" | "amber" | "coral" | "rose" | "violet";
  shape: "round" | "square" | "pebble" | "triangle" | "dome" | "drop" | "flower" | "star";
  face: "calm" | "happy" | "wink" | "sleepy" | "curious" | "focus";
};

/** One template: the starting Agent preset a new Bot copies. */
export type BotTemplate = {
  id: string;
  name: string;
  /** dsh Agent preset id. Not a snapshot of the preset body. */
  presetId: string;
};

/** One segment: an owned dsh Session with an optional label of its own. */
export type Segment = {
  sessionId: string;
  workspaceId: string;
  title: string | null;
};

export type Bot = {
  id: string;
  name: string;
  description: string | null;
  templateId: string;
  defaultModel: string | null;
  defaultThinking: string | null;
  defaultWorkspacePath: string | null;
  hadDialogue: boolean;
  status: "draft" | "ready";
  boundPresetId: string | null;
  derivedPresetId: string | null;
  archived: boolean;
  identity: BotIdentity;
  segments: readonly Segment[];
};

/** The whole Registry as the Host stores it. */
export type BotRegistry = {
  version: 6;
  templates: readonly BotTemplate[];
  bots: readonly Bot[];
};

/** Every Registry read and write returns this pair. */
export type BotsSnapshot = {
  registry: BotRegistry;
  /** Monotonic across successful writes; a fresh Registry starts at 0. */
  revision: number;
};

export type TemplateInput = { id: string; name: string; presetId: string };
export type TemplatePatch = { name?: string; presetId?: string };

export type BotInput = {
  id: string;
  name: string;
  description?: string | null;
  templateId: string;
  defaultModel?: string | null;
  defaultThinking?: string | null;
  defaultWorkspacePath?: string | null;
  identity?: BotIdentity;
};

export type BotPatch = {
  name?: string;
  description?: string | null;
  templateId?: string;
  defaultModel?: string | null;
  defaultThinking?: string | null;
  defaultWorkspacePath?: string | null;
  identity?: BotIdentity;
};

// Derived preset records. The plugin owns these shapes in `preset-types.ts`.

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
  presetId: string;
  botId: string;
  basePresetId: string;
  label: string;
  skills: readonly DerivedPresetSkill[];
  plugins: readonly DerivedPresetPlugin[];
  broken?: string;
};

export type DerivedPresetDeriveRequest = {
  botId: string;
  label: string;
  basePresetId: string;
};

export type DerivedPresetDeriveResult = { presetId: string };

export type DerivedPresetUpdateRequest = {
  /** Complete replacement list of skill bundle paths; omit to leave unchanged. */
  skills?: readonly string[];
  /** Complete replacement list of plugin overrides; omit to leave unchanged. */
  plugins?: readonly DerivedPresetPlugin[];
};

export type DerivedPresetRemoveResult = { removed: boolean };
