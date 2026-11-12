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

test("the New Bot sheet creates an initialized Bot and its first Dialogue", async () => {
  const seeded = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  const app = await open("../../App.tsx", {
    ...desktop,
    storage: { [REGISTRY_STORAGE_KEY]: serializeRegistry(seeded) },
  });

  await app.press("role:treeitem[New Bot]");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Ada");
  await app.type("id:new-bot-workspace", "/work/myaid");
  await app.press("label:Create Bot");
  await app.waitUntil(() => !app.shows("id:new-bot-sheet"));
  await app.waitFor("role:treeitem[Ada]");

  // The Bot, its identity and its first Dialogue are on disk; the Session
  // waits for a Host, so the Dialogue is what opens.
  const saved = JSON.parse(app.storage()[REGISTRY_STORAGE_KEY] ?? "{}") as BotRegistry;
  const bot = saved.bots[0];
  expect(bot?.name).toBe("Ada");
  expect(bot?.status).toBe("ready");
  expect(bot?.identity.color).toBeTruthy();
  expect(bot?.identity.glyph).toBeTruthy();
  expect(saved.dialogues[0]?.workspacePath).toBe("/work/myaid");
  expect(saved.dialogues[0]?.botId).toBe(bot?.id);

  // The Bot's own Panel still edits the initialized Bot.
  await app.press("role:treeitem[Ada]");
  await app.waitFor("id:bot-name");
  expect(app.texts()).toContain("已绑定");
  expect(app.texts()).toContain("/work/myaid");
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
