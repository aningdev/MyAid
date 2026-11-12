/**
 * What Bot Settings reads from the Host, behind one seam: the skills dsh
 * reports for a Session of this Bot (`skills.list`) and the plugin rows of the
 * Bot's preset (`pluginInventory.list`). `nsh test` substitutes a source so the
 * sheet's tabs can be driven without a Host; nothing in the product does.
 */
import type { InventoryPreset, SkillSummary } from "../../lib/dsh/connection";
import { sessionTransport } from "../dialogue/session/runtime";

export type BotFactsRequest = {
  botId: string;
  /** The Bot's preset (template's, bound, or derived). */
  presetId: string;
  /** A Session of this Bot the Host can address the catalogs by; null when it has none. */
  sessionId: string | null;
};

export type BotFacts = {
  skills: SkillSummary[];
  /** The Bot's preset composition, or null when the inventory does not report it. */
  preset: InventoryPreset | null;
  /** What the person should know when a read was partial (offline, no management). */
  note?: string;
};

export type BotFactsSource = (request: BotFactsRequest) => Promise<BotFacts>;

const fromHost: BotFactsSource = async (request) => {
  const transport = sessionTransport();
  if (!transport?.ready) return { skills: [], preset: null, note: "连上后台后显示技能与插件。" };
  const note: string[] = [];
  let preset: InventoryPreset | null = null;
  let skills: SkillSummary[] = [];
  if (transport.pluginInventory) {
    const read = await transport.pluginInventory();
    preset = read.presets.find((item) => item.id === request.presetId) ?? null;
    if (!read.managementAvailable) note.push("这个后台没有持久化的插件管理面。");
  }
  if (request.sessionId && transport.listSkills) {
    skills = await transport.listSkills(request.sessionId);
  }
  return {
    skills,
    preset,
    ...(note.length > 0 ? { note: note.join(" ") } : {}),
  };
};

let source: BotFactsSource = fromHost;

export function botFactsSource(): BotFactsSource {
  return source;
}

/** Substitute the Host reads (a test's fake). */
export function setBotFactsSource(next: BotFactsSource | undefined): void {
  source = next ?? fromHost;
}
