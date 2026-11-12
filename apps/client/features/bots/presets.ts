/**
 * The one Host-side capability Bot Settings cannot have from dsh today: writing
 * a Bot's Agent preset. dsh exposes `agentPresets.list/read/select` only —
 * preset bodies live in the profile's YAML — so capability edits (a plugin
 * switched off for this Bot, a skill added) have no Remote to land on.
 *
 * The seam stays here rather than in the sheet: `myaid-plugin-*` would supply
 * the writer, the Client keeps the registry's derived-preset rule
 * (BOT_SESSION_MAP "身份与能力"). Until then the writer reports itself
 * unavailable and the sheet shows why, instead of inventing a preset id.
 */
/** One capability change against the Bot's base preset. */
export type CapabilityChange = {
  moduleName: string;
  enabled: boolean;
};

export type DeriveRequest = {
  botId: string;
  botName: string;
  templateId: string;
  /** The preset the Bot reads today (template's, or its own bound one). */
  basePresetId: string;
  changes: readonly CapabilityChange[];
};

export type DeriveResult = { presetId: string } | { unavailable: string };

/** What a plugin must implement for Bot Settings › Skills / Plugins to save. */
export type BotPresetWriter = {
  /** False when this Host has no way to write a preset body. */
  available: boolean;
  derive(request: DeriveRequest): Promise<DeriveResult>;
};

/** Why capability edits cannot be saved yet, in the sheet and in the docs. */
export const PRESET_WRITE_GAP =
  "后台只读 Agent preset（list / read / select）：预设正文在 profile 的 YAML 里。" +
  "能力增删要等 myaid-plugin-bot-presets 提供写入口。";

const unavailable: BotPresetWriter = {
  available: false,
  derive: async () => ({ unavailable: PRESET_WRITE_GAP }),
};

let writer: BotPresetWriter = unavailable;

export function presetWriter(): BotPresetWriter {
  return writer;
}

/** Substitute the Host-side writer (a `myaid-plugin-*` Remote, or a test's fake). */
export function setPresetWriter(next: BotPresetWriter | undefined): void {
  writer = next ?? unavailable;
}
