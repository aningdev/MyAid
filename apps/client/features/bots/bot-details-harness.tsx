/**
 * Test-only entry: the Workspace Shell over a Host that *can* write presets and
 * reports one preset composition. `nsh test` opens it; nothing in the product
 * imports it, and no production path installs a writer or a facts source.
 * The Bot details modal is inside `AppShell`.
 *
 * What it stands in for: `dsh-bot-presets` (the derived-preset writer),
 * the Host's `pluginInventory` / `skills` reads, and a model catalog (the Runs
 * with tab lists models only once dsh reports some).
 */
import { basename } from "path";

import type { BotPresetRecord } from "@dsh-bot/dsh-web-protocol/bot-presets";
import { mount } from "nsh";

import { AppShell } from "../../components/AppShell";
import { catalogModelKey, modelCatalog } from "../dialogue/session/runtime";
import { setBotFactsSource } from "./facts";
import { setPresetWriter } from "./presets";

catalogModelKey.set("acme/fast");
modelCatalog.set({
  default: { provider: "acme", model: "fast" },
  models: [
    {
      provider: "acme",
      providerName: "Acme",
      model: "fast",
      name: "Acme Fast",
      thinking: [
        { id: "low", name: "Low" },
        { id: "high", name: "High" },
      ],
    },
    { provider: "acme", providerName: "Acme", model: "deep", name: "Acme Deep" },
    { provider: "openai", providerName: "OpenAI", model: "gpt-5", name: "GPT-5" },
  ],
  failures: [],
});

let record: BotPresetRecord | null = {
  presetId: "bot-presets-bot",
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
      presetId: `bot-presets-${request.botId}`,
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
