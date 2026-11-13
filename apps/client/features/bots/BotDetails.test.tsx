/**
 * Bot details over the harness Host (`bot-details-harness.tsx`): a
 * template-bound Bot edits its registry preferences, a capability change
 * derives its own preset instead of touching the template, and the modal
 * carries the segment's own facts and the archive verb.
 */
import { expect, test } from "nsh/test";

import { open } from "../../test/open";
import { workspaceRow, workspaceStorage } from "../../test/workspaces";
import {
  archiveBot,
  assignDerivedPreset,
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  parseRegistry,
  serializeRegistry,
  type BotRegistry,
} from "./model";
import { REGISTRY_STORAGE_KEY } from "./store";

const desktop = { platform: "web" as const, width: 1200, height: 860 };

/** Ada (ready, template-bound) → one segment. */
function sampleRegistry(): BotRegistry {
  return claimSegment(
    initializeBot(
      createBot(
        createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
        { name: "Ada", templateId: "tmpl" },
        "bot",
      ),
      "bot",
    ),
    "bot",
    "s1",
    "ws-work",
  );
}

/**
 * Opens the harness app, the Bot's Pane and its details modal. The Workspace
 * baseline is dsh's, so the segment's directory is a real path (the product
 * reads it from the official model, never from the registry).
 */
async function details(registry: BotRegistry = sampleRegistry()) {
  const app = await open("./bot-details-harness.tsx", {
    ...desktop,
    storage: {
      [REGISTRY_STORAGE_KEY]: serializeRegistry(registry),
      ...workspaceStorage({
        rows: [
          workspaceRow({
            id: "ws-work",
            path: "/work/myaid",
            title: "myaid",
            sessionIds: ["s1"],
          }),
        ],
      }),
    },
  });
  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");
  await app.press("label:Bot details: Ada");
  await app.waitFor("id:bot-details");
  return app;
}

test("Profile saves the Bot's name and description in the registry", async () => {
  const app = await details();
  expect(app.texts()).toContain("standard");
  expect(app.texts()).toContain("已绑定");

  await app.clear("id:bot-details-name");
  await app.type("id:bot-details-name", "Ada L");
  await app.type("id:bot-details-description", "Keeps the release branch tidy");
  await app.press("id:bot-details >> Save");

  await app.waitUntil(() => !app.shows("id:bot-details"));
  // The list row and the Pane title behind the modal read the saved Bot.
  await app.waitFor("label:Ada L");
  await app.waitFor("id:tab-panel-1 >> text:Ada L");
  const saved = parseRegistry(app.storage()[REGISTRY_STORAGE_KEY] ?? "");
  expect(saved.ok).toBe(true);
  expect(saved.ok && saved.state === "current" ? saved.registry.bots[0]?.description : null).toBe(
    "Keeps the release branch tidy",
  );
});

test("an added skill can be removed from an already-derived Bot", async () => {
  const app = await details(assignDerivedPreset(sampleRegistry(), "bot", "bot-preset-bot"));
  await app.press("Skills");
  await app.waitFor("text:/release-notes");
  await app.press("label:移除 release-notes");
  await app.press("id:bot-details >> Save");
  await app.waitUntil(() => !app.shows("id:bot-details"));

  await app.press("label:Bot details: Ada");
  await app.waitFor("id:bot-details");
  await app.press("Skills");
  await app.waitUntil(() => app.texts().some((text) => text.includes("还没有添加技能")));
  expect(app.texts()).not.toContain("移除 release-notes");
});

test("a capability change on a template-bound Bot derives its own preset", async () => {
  const app = await details();

  await app.press("Runs with");
  await app.waitFor("text:思考");
  await app.press("Skills");
  await app.waitFor("text:/release-notes");

  await app.press("Plugins");
  await app.waitFor("text:@deepseek-ai/dsh-tool-bash");
  // The Bot's preset is still the template's: turning a row on is its own preset.
  await app.press("label:切换 Bash");
  await app.press("id:bot-details >> Save");

  await app.waitUntil(() => !app.shows("id:bot-details"));
  await app.press("label:Bot details: Ada");
  await app.waitFor("id:bot-details");
  await app.waitFor("text:单独配置");
  expect(app.texts()).toContain("bot-preset-bot");
});

test("Cancel dismisses without writing", async () => {
  const app = await details();

  await app.clear("id:bot-details-name");
  await app.type("id:bot-details-name", "Ada Draft");
  await app.press("Cancel");
  await app.waitUntil(() => !app.shows("id:bot-details"));
  expect(app.shows("label:Ada")).toBe(true);
  expect(app.texts()).not.toContain("Ada Draft");
});

test("the modal shows the current segment's working directory and model", async () => {
  const app = await details();
  // The segment section sits under the tab's own content: a person scrolls the
  // modal body to it when it does not fit, and the test does the same (a
  // headless run lays the whole body out, where there is nothing to scroll).
  await app.waitFor("id:bot-details-scroll");
  await app.scroll("id:bot-details-scroll", 900).catch(() => undefined);
  await app.waitFor("id:bot-details-segment");
  // The path is dsh's Workspace path, the one the baseline reported.
  await app.waitFor("id:bot-details-path");
  expect(app.texts().some((text) => text.includes("/work/myaid"))).toBe(true);
  await app.waitFor("id:bot-details-model");
  expect(app.texts()).toContain("Current segment");
  await app.waitFor("id:bot-details-usage");
  expect(app.texts()).toContain("Compact");
});

test("Archive closes the modal and takes the Bot out of the list", async () => {
  const app = await details();
  await app.press("id:bot-details >> Archive");
  await app.waitUntil(() => !app.shows("id:bot-details"));
  await app.waitUntil(() => !app.shows("label:Ada"));
  expect(app.storage()[REGISTRY_STORAGE_KEY]).toContain('"archived": true');
});

test("an archived Bot's modal offers Unarchive", async () => {
  const app = await open("./bot-details-harness.tsx", {
    ...desktop,
    storage: { [REGISTRY_STORAGE_KEY]: serializeRegistry(archiveBot(sampleRegistry(), "bot")) },
  });
  await app.waitFor("id:tab-panel-1 >> text:Empty");
  // The archived Bot is out of the list, so a search finds it and opens it.
  await app.type("id:nav-search", "Ada");
  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");
  await app.press("label:Bot details: Ada");
  await app.waitFor("id:bot-details");
  await app.press("id:bot-details >> Unarchive");
  await app.waitUntil(() => app.storage()[REGISTRY_STORAGE_KEY]?.includes('"archived": false'));
  await app.clear("id:nav-search");
  await app.waitFor("label:Ada");
});
