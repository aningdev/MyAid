/**
 * Test-only entry: the Workspace Shell over a Host that *can* write presets and
 * reports one preset composition. `nsh test` opens it; nothing in the product
 * imports it, and no production path installs a writer or a facts source.
 *
 * What it stands in for: `myaid-plugin-bot-presets` (the derived-preset writer)
 * and the Host's `pluginInventory` / `skills` reads.
 */
import { mount } from "nsh";

import { AppShell } from "../../components/AppShell";
import { setBotFactsSource } from "./facts";
import { setPresetWriter } from "./presets";

setPresetWriter({
  available: true,
  derive: async (request) => ({ presetId: `bot-preset-${request.botId}` }),
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
