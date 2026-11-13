/**
 * Test-only entry: the Workspace Shell over a Host that *can* write presets and
 * reports one preset composition. `nsh test` opens it; nothing in the product
 * imports it, and no production path installs a writer or a facts source.
 *
 * What it stands in for: `myaid-plugin-bot-presets` (the derived-preset writer)
 * and the Host's `pluginInventory` / `skills` reads.
 */
import { basename } from "path";

import type { BotPresetRecord } from "@myaid/dsh-web-protocol/bot-presets";
import { mount } from "nsh";

import { AppShell } from "../../components/AppShell";
import { setBotFactsSource } from "./facts";
import { setPresetWriter } from "./presets";

let record: BotPresetRecord | null = {
  presetId: "bot-preset-bot",
  botId: "bot",
  basePresetId: "standard",
  label: "Ada",
  skills: [{ name: "release-notes", path: "/tmp/release-notes" }],
  plugins: [],
};

setPresetWriter({
  probe: async () => true,
  derive: async (request) => {
    record = {
      presetId: `bot-preset-${request.botId}`,
      botId: request.botId,
      basePresetId: request.basePresetId,
      label: request.label,
      skills: [],
      plugins: [],
    };
    return { presetId: record.presetId };
  },
  read: async (presetId) => (record?.presetId === presetId ? record : null),
  update: async (presetId, patch) => {
    if (!record || record.presetId !== presetId) {
      return { unavailable: `没有 ${presetId}` };
    }
    record = {
      ...record,
      plugins: patch.plugins ?? record.plugins,
      skills:
        patch.skills === undefined
          ? record.skills
          : patch.skills.map((path) => ({ name: basename(path), path })),
    };
    return record;
  },
  remove: async (presetId) => {
    if (record?.presetId !== presetId) return { removed: false };
    record = null;
    return { removed: true };
  },
});

setBotFactsSource(async (request) => ({
  skills: [{ name: "release-notes", description: "Write release notes", modelInvocable: true }],
  preset: {
    id: request.presetId,
    isDefault: false,
    rows: [
      {
        entryId: "tool-bash",
        moduleName: "@deepseek-ai/dsh-tool-bash",
        name: "Bash",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "tool-present",
        moduleName: "@deepseek-ai/dsh-tool-present",
        name: "Present",
        enabled: true,
        fiberPhase: "active",
      },
    ],
  },
}));

mount(AppShell);
