/**
 * The Bot editor as a Panel: a draft runs template → Bot → initialized Bot →
 * Dialogue without leaving the Workbench.
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
} from "./model";
import { REGISTRY_STORAGE_KEY } from "./store";

const desktop = { platform: "web" as const, width: 1100, height: 800 };

test("a new Bot binds its template preset and starts a Dialogue", async () => {
  const app = await open("../../App.tsx", desktop);

  await app.press("role:treeitem[New Bot]");
  await app.waitFor("id:bot-name");

  // No templates yet: one is made inline, and the Bot follows it.
  await app.type("id:template-name", "Coding");
  await app.type("id:template-preset", "standard");
  await app.press("新建模板");
  await app.waitFor("text:跟随模板");

  await app.type("id:bot-name", "Ada");
  await app.press("保存");
  await app.waitFor("id:tab-panel-1 >> text:Ada");
  expect(app.texts()).toContain("跟随模板");

  await app.press("初始化");
  await app.waitFor("text:已绑定");
  expect(app.texts()).not.toContain("跟随模板");
  expect(app.shows("初始化")).toBe(false);
  expect(app.shows("新建 Dialogue")).toBe(true);

  await app.type("id:dialogue-workspace", "/work/myaid");
  await app.press("新建 Dialogue");
  await app.waitFor("id:tab-panel-1 >> text:Ada · myaid");
  await app.waitFor("text:New Session");
});

test("a registered Bot opens its editor from the Navigator", async () => {
  const registered: BotRegistry = claimSession(
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
  const app = await open("../../App.tsx", {
    ...desktop,
    storage: {
      [REGISTRY_STORAGE_KEY]: serializeRegistry(renameClaim(registered, "dlg", "s1", "First run")),
    },
  });

  await app.waitFor("role:treeitem[Ada]");
  await app.press("role:treeitem[Ada]");
  await app.waitFor("id:bot-name");
  expect(app.texts()).toContain("standard");
  expect(app.texts()).toContain("已绑定");
  // Ready Bots can start Dialogues, and their existing one is listed.
  expect(app.shows("新建 Dialogue")).toBe(true);
  expect(app.texts()).toContain("/work/myaid");
  expect(app.texts()).toContain("1 个 Session");
});
