/**
 * Shell × features: the Navigator is the registry's projection, and a press
 * opens that object's Panel. The registry is seeded through the app's storage
 * (the web target's store), so the test needs no Host and writes nothing.
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
  type BotRegistry,
} from "../../features/bots/model";
import { serializeRegistry } from "../../features/bots/model";
import { REGISTRY_STORAGE_KEY } from "../../features/bots/store";

const desktop = { platform: "web" as const, width: 1100, height: 800 };

/** The app's start, with `registry` already on disk. */
function start(registry: BotRegistry) {
  return open("../../App.tsx", {
    ...desktop,
    storage: { [REGISTRY_STORAGE_KEY]: serializeRegistry(registry) },
  });
}

/** Ada (ready) → one Dialogue at /work/myaid → one claimed Session. */
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

test("the Navigator lists the registry, and a Session opens its chat", async () => {
  const app = await start(sampleRegistry());

  await app.waitFor("role:treeitem[Ada]");
  await app.press("role:treeitem[Ada]");
  await app.waitFor("id:tab-panel-1 >> text:Ada");

  // The Bot's row opened it and expanded its Dialogues (the same press).
  await app.waitFor("role:treeitem[myaid]");
  await app.press("role:treeitem[myaid]");
  await app.waitFor("id:tab-panel-1 >> text:Ada · myaid");
  await app.waitFor("text:New Session");

  await app.press("role:treeitem[First run]");
  await app.waitFor("text:How can I help?");
  expect(app.shows("text:New Session")).toBe(false);
});

test("a Dialogue's panel shows its Bot, workspace and claimed Sessions", async () => {
  const app = await start(sampleRegistry());

  // The Dialogues section lists it too, labelled Bot · workspace.
  await app.waitFor("role:treeitem[Ada · myaid]");
  await app.press("role:treeitem[Ada · myaid]");
  await app.waitFor("text:New Session");

  const texts = app.texts();
  expect(texts.some((t) => t.includes("/work/myaid"))).toBe(true);
  expect(texts.some((t) => t === "First run")).toBe(true);
});

test("the Bots section's + opens the new-Bot draft", async () => {
  const app = await start(sampleRegistry());
  await app.waitFor("role:treeitem[Ada]");

  await app.press("label:New Bot");
  await app.waitFor("id:bot-name");
  expect(app.shows("role:treeitem[Ada]")).toBe(true);
});
