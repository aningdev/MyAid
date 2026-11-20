/**
 * Bot details over the harness Host (`bot-details-harness.tsx`): a
 * template-bound Bot edits its registry preferences, a capability change
 * derives its own preset instead of touching the template, and the modal
 * carries the segment's own facts and the archive verb.
 */
import { expect, test } from "nsh/test";

import { t } from "../../lib/i18n";
import {
  BOTS_FIXTURE_KEY,
  archiveBot,
  assignDerivedPreset,
  botsStorage,
  claimSegment,
  createBot,
  createTemplate,
  initializeBot,
  mainBot,
} from "../../test/bots-fixture";
import { open } from "../../test/open";
import { workspaceRow, workspaceStorage } from "../../test/workspaces";
import { emptyRegistry, type BotRegistry } from "./model";

const desktop = { platform: "web" as const, width: 1200, height: 860 };

/** Ada (ready, template-bound) → one segment. `model` is the Bot's default route. */
function sampleRegistry(model: string | null = null): BotRegistry {
  return claimSegment(
    initializeBot(
      createBot(
        createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
        { name: "Ada", templateId: "tmpl", defaultModel: model },
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
      ...botsStorage(registry),
      ...workspaceStorage({
        rows: [
          workspaceRow({
            id: "ws-work",
            path: "/work/dsh-bot",
            title: "dsh-bot",
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
  expect(app.texts()).toContain(t("bot.binding.bound"));

  await app.clear("id:bot-details-name");
  await app.type("id:bot-details-name", "Ada L");
  await app.type("id:bot-details-description", "Keeps the release branch tidy");
  await app.press("id:bot-details >> Save");

  await app.waitUntil(() => !app.shows("id:bot-details"));
  // The list row and the Pane title behind the modal read the saved Bot.
  await app.waitFor("label:Ada L");
  await app.waitFor("id:tab-panel-1 >> text:Ada L");
  const saved = JSON.parse(app.storage()[BOTS_FIXTURE_KEY] ?? "") as BotRegistry;
  expect(saved.bots[0]?.description).toBe("Keeps the release branch tidy");
});

test("Runs with lists the models as one radio group", async () => {
  const app = await details(sampleRegistry("acme/fast"));
  await app.press("Runs with");
  await app.waitFor("text:acme/fast");
  // The Bot's route is the checked radio; checking another one becomes its default.
  await app.press("label:Acme Deep");
  await app.press("id:bot-details >> Save");
  await app.waitUntil(() => !app.shows("id:bot-details"));
  const saved = JSON.parse(app.storage()[BOTS_FIXTURE_KEY] ?? "") as BotRegistry;
  expect(saved.bots[0]?.defaultModel).toBe("acme/deep");
});

test("an added skill can be removed from an already-derived Bot", async () => {
  const app = await details(assignDerivedPreset(sampleRegistry(), "bot", "bots-bot"));
  await app.press("Skills");
  await app.waitFor("text:/release-notes");
  await app.press(`label:${t("bot.skills.remove", { name: "release-notes" })}`);
  await app.press("id:bot-details >> Save");
  await app.waitUntil(() => !app.shows("id:bot-details"));

  await app.press("label:Bot details: Ada");
  await app.waitFor("id:bot-details");
  await app.press("Skills");
  await app.waitUntil(() => app.texts().some((text) => text.includes(t("bot.skills.none"))));
  expect(app.texts()).not.toContain(t("bot.skills.remove", { name: "release-notes" }));
});

test("a capability change on a template-bound Bot derives its own preset", async () => {
  const app = await details();

  await app.press("Runs with");
  await app.waitFor(`text:${t("bot.thinking")}`);
  await app.press("Skills");
  await app.waitFor("text:/release-notes");

  await app.press("Plugins");
  await app.waitFor("text:@deepseek-ai/dsh-tool-bash");
  // The Bot's preset is still the template's: turning a row on is its own preset.
  await app.press(`label:${t("bot.plugins.toggle", { name: "Bash" })}`);
  await app.press("id:bot-details >> Save");

  await app.waitUntil(() => !app.shows("id:bot-details"));
  await app.press("label:Bot details: Ada");
  await app.waitFor("id:bot-details");
  await app.waitFor(`text:${t("bot.binding.custom")}`);
  expect(app.texts()).toContain("bots-bot");
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
  expect(app.texts().some((text) => text.includes("/work/dsh-bot"))).toBe(true);
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
  const saved = JSON.parse(app.storage()[BOTS_FIXTURE_KEY] ?? "") as BotRegistry;
  expect(saved.bots[0]?.archived).toBe(true);
});

test("the Main Bot's details have no archive or delete", async () => {
  const app = await open("./bot-details-harness.tsx", {
    ...desktop,
    storage: {
      ...botsStorage(mainBot(sampleRegistry())),
      ...workspaceStorage({
        rows: [
          workspaceRow({
            id: "ws-work",
            path: "/work/dsh-bot",
            title: "dsh-bot",
            sessionIds: ["s1"],
          }),
        ],
      }),
    },
  });
  await app.waitFor("label:Main Bot");
  await app.press("label:Main Bot");
  await app.waitFor("id:tab-panel-1 >> text:Main Bot");
  await app.press("label:Bot details: Main Bot");
  await app.waitFor("id:bot-details");
  expect(app.shows("id:bot-details >> Archive")).toBe(false);
  expect(app.shows("id:bot-details >> Delete")).toBe(false);
  expect(app.shows("id:bot-details >> Unarchive")).toBe(false);
});

test("an archived Bot's modal offers Unarchive", async () => {
  const app = await open("./bot-details-harness.tsx", {
    ...desktop,
    storage: { ...botsStorage(archiveBot(sampleRegistry(), "bot")) },
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
  await app.waitUntil(() => {
    const text = app.storage()[BOTS_FIXTURE_KEY];
    if (!text) return false;
    return (JSON.parse(text) as BotRegistry).bots[0]?.archived === false;
  });
  await app.clear("id:nav-search");
  await app.waitFor("label:Ada");
});
