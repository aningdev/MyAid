/**
 * Bot Settings over the harness Host (`bot-settings-harness.tsx`): a
 * template-bound Bot edits its registry preferences, and a capability change
 * derives its own preset instead of touching the template.
 */
import { expect, open, test } from "nsh/test";

import {
  assignDerivedPreset,
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  parseRegistry,
  serializeRegistry,
  type BotRegistry,
} from "./model";
import { REGISTRY_STORAGE_KEY } from "./store";

const desktop = { platform: "web" as const, width: 1200, height: 860 };

/** Ada (ready, template-bound) → one Dialogue → one claimed Session. */
function sampleRegistry(): BotRegistry {
  return claimSession(
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
}

async function sheet() {
  const app = await open("./bot-settings-harness.tsx", {
    ...desktop,
    storage: { [REGISTRY_STORAGE_KEY]: serializeRegistry(sampleRegistry()) },
  });
  await app.waitFor("role:treeitem[Ada]");
  await app.press("role:treeitem[Ada]");
  await app.waitFor("id:bot-name");
  await app.press("Bot Settings…");
  await app.waitFor("id:bot-settings");
  return app;
}

test("Profile saves the Bot's name and description in the registry", async () => {
  const app = await sheet();
  expect(app.texts()).toContain("standard");
  expect(app.texts()).toContain("已绑定");

  await app.clear("id:bot-settings-name");
  await app.type("id:bot-settings-name", "Ada L");
  await app.type("id:bot-settings-description", "Keeps the release branch tidy");
  await app.press("id:bot-settings >> 保存");

  await app.waitUntil(() => !app.shows("id:bot-settings"));
  // The Navigator and the Panel behind the sheet read the saved Bot.
  await app.waitFor("role:treeitem[Ada L]");
  const saved = parseRegistry(app.storage()[REGISTRY_STORAGE_KEY] ?? "");
  expect(saved.ok).toBe(true);
  expect(saved.ok ? saved.registry.bots[0]?.description : null).toBe(
    "Keeps the release branch tidy",
  );
});

test("an added skill can be removed from an already-derived Bot", async () => {
  const app = await open("./bot-settings-harness.tsx", {
    ...desktop,
    storage: {
      [REGISTRY_STORAGE_KEY]: serializeRegistry(
        assignDerivedPreset(sampleRegistry(), "bot", "bot-preset-bot"),
      ),
    },
  });
  await app.waitFor("role:treeitem[Ada]");
  await app.press("role:treeitem[Ada]");
  await app.waitFor("id:bot-name");
  await app.press("Bot Settings…");
  await app.waitFor("id:bot-settings");
  await app.press("Skills");
  await app.waitFor("text:/release-notes");
  await app.press("label:移除 release-notes");
  await app.press("id:bot-settings >> 保存");
  await app.waitUntil(() => !app.shows("id:bot-settings"));

  await app.press("Bot Settings…");
  await app.waitFor("id:bot-settings");
  await app.press("Skills");
  await app.waitUntil(() => app.texts().some((text) => text.includes("还没有添加技能")));
  expect(app.texts()).not.toContain("移除 release-notes");
});

test("a capability change on a template-bound Bot derives its own preset", async () => {
  const app = await sheet();

  await app.press("Runs with");
  await app.waitFor("text:思考");
  await app.press("Skills");
  await app.waitFor("text:/release-notes");

  await app.press("Plugins");
  await app.waitFor("text:@deepseek-ai/dsh-tool-bash");
  // The Bot's preset is still the template's: turning a row on is its own preset.
  await app.press("label:切换 Bash");
  await app.press("id:bot-settings >> 保存");

  await app.waitUntil(() => !app.shows("id:bot-settings"));
  await app.waitFor("text:单独配置");
  expect(app.texts()).toContain("bot-preset-bot");
});

test("the sheet keeps an unknown Bot's edit from writing", async () => {
  const app = await open("./bot-settings-harness.tsx", {
    ...desktop,
    storage: { [REGISTRY_STORAGE_KEY]: serializeRegistry(sampleRegistry()) },
  });
  await app.waitFor("role:treeitem[Ada]");
  await app.press("role:treeitem[Ada]");
  await app.waitFor("id:bot-name");
  await app.press("Bot Settings…");
  await app.waitFor("id:bot-settings");

  await app.clear("id:bot-settings-name");
  await app.type("id:bot-settings-name", "Ada L");
  // Cancel dismisses without writing: the Panel keeps the stored name.
  await app.press("取消");
  await app.waitUntil(() => !app.shows("id:bot-settings"));
  await app.waitFor("id:bot-name");
  expect(app.texts()).toContain("Ada");
  expect(app.texts()).not.toContain("Ada L");
});
