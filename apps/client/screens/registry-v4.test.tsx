/**
 * A v3 / v4 / v5 registry is read but never written: its Dialogues own the
 * Bot's conversation, and merging them into one long conversation needs a
 * Host. Without one the app says so, opens no Bot, and leaves the file exactly
 * as it found it.
 */
import { expect, test } from "nsh/test";

import { REGISTRY_STORAGE_KEY } from "../features/bots/store";
import { t } from "../lib/i18n";
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
  expect(
    app.texts().some((text) => text.includes(t("registry.migrationTooOld", { version: 4 }))),
  ).toBe(true);
  // Nothing of the old shape becomes a place: the list waits for the Host.
  expect(app.shows("label:New Bot")).toBe(true);
  expect(app.texts()).toContain("No Bots yet.");
  expect(app.shows("label:Ada")).toBe(false);
  // The file keeps its version and its paths; the notice is not a migration.
  expect(app.storage()[REGISTRY_STORAGE_KEY]).toBe(V4);
});

const V5 = `${JSON.stringify(
  {
    version: 5,
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
        workspaceId: "ws-work",
        claims: [{ sessionId: "s1", title: "First run" }],
      },
    ],
  },
  null,
  2,
)}\n`;

test("a v5 registry without a Host stays untouched and says why", async () => {
  const app = await open("../App.tsx", {
    ...desktop,
    storage: { [REGISTRY_STORAGE_KEY]: V5 },
  });

  await app.waitFor("id:migration-notice");
  expect(
    app.texts().some((text) => text.includes(t("registry.migrationTooOld", { version: 5 }))),
  ).toBe(true);
  expect(app.texts()).toContain("No Bots yet.");
  expect(app.storage()[REGISTRY_STORAGE_KEY]).toBe(V5);
});
