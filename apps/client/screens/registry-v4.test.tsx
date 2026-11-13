/**
 * A v3 / v4 registry is read but never written: its Dialogues own paths that
 * only dsh's Workspaces can take over, and that needs a Host. Without one the
 * app says so and leaves the file exactly as it found it.
 */
import { expect, test } from "nsh/test";

import { REGISTRY_STORAGE_KEY } from "../features/bots/store";
import { open } from "../test/open";

const desktop = { platform: "web" as const, width: 1100, height: 800 };

const V4 = `${JSON.stringify(
  {
    version: 4,
    templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
    bots: [
      {
        id: "bot",
        name: "Ada",
        description: null,
        templateId: "tmpl",
        defaultModel: null,
        defaultThinking: null,
        defaultWorkspacePath: "/work/myaid",
        hadDialogue: true,
        status: "ready",
        boundPresetId: "standard",
        derivedPresetId: null,
        identity: { color: "rose", glyph: "orbit" },
      },
    ],
    dialogues: [
      {
        id: "dlg",
        botId: "bot",
        workspacePath: "/work/myaid",
        name: "Release notes",
        archived: false,
        claims: [{ sessionId: "s1", title: "First run", archived: false }],
      },
    ],
  },
  null,
  2,
)}\n`;

test("a v4 registry without a Host stays untouched and says why", async () => {
  const app = await open("../App.tsx", {
    ...desktop,
    storage: { [REGISTRY_STORAGE_KEY]: V4 },
  });

  await app.waitFor("id:migration-notice");
  expect(app.texts().some((text) => text.includes("旧版本"))).toBe(true);
  // No Bot row: a v4 Dialogue has no Workspace id, so nothing is shown as v5.
  expect(app.shows("role:treeitem[Ada]")).toBe(false);
  // The file keeps its version and its paths; the notice is not a migration.
  expect(app.storage()[REGISTRY_STORAGE_KEY]).toBe(V4);
});
