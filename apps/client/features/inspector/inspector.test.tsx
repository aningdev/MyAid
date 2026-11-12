/**
 * The Inspector beside a Session: the Panel's own toggle and ⌥⌘I, the Bot and
 * Dialogue it belongs to, and the sections dsh can answer (deliverables from
 * the Session's events, usage from its projections). The registry is seeded
 * through the app's storage, so no Host is needed.
 */
import { expect, open, test } from "nsh/test";

import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  renameClaim,
  serializeRegistry,
  type BotRegistry,
} from "../bots/model";
import { REGISTRY_STORAGE_KEY } from "../bots/store";

const desktop = { platform: "web" as const, width: 1280, height: 860 };

/** Ada (ready) → one Dialogue at /work/myaid → one claimed Session, opened. */
function sampleRegistry(): BotRegistry {
  const created = claimSession(
    createDialogue(
      initializeBot(
        createBot(
          createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
          { name: "Ada", templateId: "tmpl" },
          "bot",
        ),
        "bot",
      ),
      { botId: "bot", workspacePath: "/work/myaid" },
      "dlg",
    ),
    "dlg",
    "s1",
  );
  return renameClaim(created, "dlg", "s1", "First run");
}

async function session() {
  const app = await open("../../App.tsx", {
    ...desktop,
    storage: { [REGISTRY_STORAGE_KEY]: serializeRegistry(sampleRegistry()) },
  });
  // Bot → Dialogue (expands its Sessions) → the claimed Session.
  await app.waitFor("role:treeitem[Ada]");
  await app.press("role:treeitem[Ada]");
  await app.waitFor("role:treeitem[myaid]");
  await app.press("role:treeitem[myaid]");
  await app.waitFor("role:treeitem[First run]");
  await app.press("role:treeitem[First run]");
  await app.waitFor("text:Message Ada");
  return app;
}

test("the Panel's toggle opens the Inspector on this Session", async () => {
  const app = await session();
  expect(app.shows("id:inspector-bot")).toBe(false);

  await app.press("label:Show Inspector");
  await app.waitFor("id:inspector-bot");
  // Bot: name, template, the preset it runs on, and the way into its settings.
  await app.waitFor("id:inspector-bot >> text:Ada");
  expect(app.texts()).toContain("Coding");
  expect(app.texts()).toContain("standard");
  expect(app.texts()).toContain("Bound");
  expect(app.shows("Bot Settings…")).toBe(true);
  // Dialogue: the workspace and this Dialogue's Sessions.
  await app.waitFor("id:inspector-dialogue");
  expect(app.texts()).toContain("/work/myaid");
  expect(app.shows("text:First run")).toBe(true);
  expect(app.shows("New Session")).toBe(true);
  // The sections dsh does not answer without a Host say so.
  expect(app.shows("id:inspector-deliverables")).toBe(true);
  expect(app.texts()).toContain("Usage shows once connected to the backend.");

  // The chat keeps its own column; the Inspector closes again from its tab.
  expect(app.shows("text:Message Ada")).toBe(true);
  await app.press("label:Hide Inspector");
  await app.waitUntil(() => !app.shows("id:inspector-bot"));
  expect(app.shows("text:Message Ada")).toBe(true);
});

test("⌥⌘I toggles the active Panel's Inspector", async () => {
  const app = await session();
  await app.keyboard.press("alt+mod+i");
  await app.waitFor("id:inspector-bot");
  await app.keyboard.press("alt+mod+i");
  await app.waitUntil(() => !app.shows("id:inspector-bot"));
  expect(app.shows("text:Message Ada")).toBe(true);
});

test("the Inspector's Bot section opens Bot Settings", async () => {
  const app = await session();
  await app.press("label:Show Inspector");
  await app.waitFor("id:inspector-bot");
  await app.press("Bot Settings…");
  await app.waitFor("id:bot-settings");
  expect(app.texts()).toContain("Runs with");
});
