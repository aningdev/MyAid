import { expect, test } from "nsh/test";

import {
  archiveDialogue,
  assignDerivedPreset,
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  deleteBot,
  deleteTemplate,
  emptyRegistry,
  importTemplatesFromPresets,
  initializeBot,
  parseRegistry,
  presetBinding,
  presetForBot,
  RegistryRejection,
  releaseClaim,
  updateBot,
  updateTemplate,
} from "./model";
import { BotRegistryRepository, memoryStore } from "./store";

function codingDraft() {
  const withTemplate = createTemplate(
    emptyRegistry(),
    { name: "Coding", presetId: "standard" },
    "tmpl",
  );
  return createBot(withTemplate, { name: "Ada", templateId: "tmpl" }, "bot");
}

function readyWithDialogue() {
  let registry = initializeBot(codingDraft(), "bot");
  registry = createDialogue(registry, { botId: "bot", workspacePath: "/work" }, "dlg");
  return registry;
}

test("a draft follows the template preset", () => {
  let registry = codingDraft();
  expect(presetForBot(registry, "bot")).toBe("standard");
  expect(presetBinding(registry.bots[0], registry.templates[0]).label).toBe("跟随模板");

  registry = updateTemplate(registry, "tmpl", { presetId: "minimal" });
  expect(presetForBot(registry, "bot")).toBe("minimal");
  expect(registry.bots[0].boundPresetId).toBe(null);
});

test("initialization binds the template preset without a workspace", () => {
  let registry = codingDraft();
  registry = initializeBot(registry, "bot");
  expect(registry.bots[0].status).toBe("ready");
  expect(registry.bots[0].boundPresetId).toBe("standard");
  expect(presetBinding(registry.bots[0], registry.templates[0]).label).toBe("已绑定");

  registry = updateTemplate(registry, "tmpl", { presetId: "minimal" });
  expect(presetForBot(registry, "bot")).toBe("standard");

  const draft = createBot(registry, { name: "Bea", templateId: "tmpl" }, "bea");
  expect(presetForBot(draft, "bea")).toBe("minimal");
});

test("a derived preset wins and the template reference stays", () => {
  let registry = initializeBot(codingDraft(), "bot");
  registry = assignDerivedPreset(registry, "bot", "bot-ada");
  expect(presetForBot(registry, "bot")).toBe("bot-ada");
  expect(presetBinding(registry.bots[0], registry.templates[0]).label).toBe("单独配置");
  expect(registry.bots[0].templateId).toBe("tmpl");
  expect(() => updateBot(registry, "bot", { templateId: "other" })).toThrow(RegistryRejection);
  const renamed = updateBot(registry, "bot", { name: "Ada 2", defaultModel: "deepseek" });
  expect(renamed.bots[0].name).toBe("Ada 2");
  expect(renamed.bots[0].defaultModel).toBe("deepseek");
  expect(renamed.bots[0].templateId).toBe("tmpl");
});

test("deleting a template that a bot still uses is refused", () => {
  const registry = codingDraft();
  expect(() => deleteTemplate(registry, "tmpl")).toThrow(RegistryRejection);
  expect(registry.templates.length).toBe(1);
  const gone = deleteTemplate({ ...registry, bots: [] }, "tmpl");
  expect(gone.templates.length).toBe(0);
});

test("creating a dialogue requires a workspace path", () => {
  const registry = initializeBot(codingDraft(), "bot");
  expect(() => createDialogue(registry, { botId: "bot", workspacePath: "  " }, "dlg")).toThrow(
    RegistryRejection,
  );
  expect(registry.dialogues).toHaveLength(0);
});

test("a corrupt registry is reported and not overwritten", async () => {
  const store = memoryStore("{");
  const repo = new BotRegistryRepository(store);
  const loaded = await repo.load();
  expect(loaded.corrupt).toBe("注册表不是 JSON。");
  await expect(
    repo.commit((registry) =>
      createTemplate(registry, { name: "Coding", presetId: "standard" }, "tmpl"),
    ),
  ).rejects.toMatchObject({ issue: { code: "corrupt" } });
  expect(store.text()).toBe("{");
});

test("a ready bot creates dialogues, claims sessions, and cannot be deleted afterwards", () => {
  let registry = initializeBot(codingDraft(), "bot");
  expect(deleteBot(registry, "bot").bots).toHaveLength(0);

  registry = readyWithDialogue();
  expect(registry.bots[0].hadDialogue).toBe(true);
  expect(registry.dialogues[0]?.workspacePath).toBe("/work");
  registry = claimSession(registry, "dlg", "s1");
  expect(registry.dialogues[0]?.claims).toHaveLength(1);
  registry = archiveDialogue(registry, "dlg");
  expect(registry.dialogues[0]?.archived).toBe(true);
  expect(() => claimSession(registry, "dlg", "s2")).toThrow(RegistryRejection);
  registry = releaseClaim(registry, "dlg", "s1");
  expect(registry.dialogues[0]?.claims).toHaveLength(0);
  expect(() => deleteBot(registry, "bot")).toThrow(RegistryRejection);
  expect(() => claimSession(initializeBot(codingDraft(), "bot"), "missing", "s2")).toThrow(
    RegistryRejection,
  );
});

test("one session belongs to one dialogue", () => {
  let registry = claimSession(readyWithDialogue(), "dlg", "s1");
  registry = createDialogue(
    initializeBot(createBot(registry, { name: "Bea", templateId: "tmpl" }, "bea"), "bea"),
    { botId: "bea", workspacePath: "/else" },
    "dlg2",
  );
  expect(() => claimSession(registry, "dlg2", "s1")).toThrow(RegistryRejection);
});

test("dsh presets become templates keyed by preset id", () => {
  const imported = importTemplatesFromPresets(emptyRegistry(), [
    { id: "standard", name: "Standard" },
    { id: "minimal", name: "Minimal", broken: "offline" },
    { id: "coding", name: "Coding" },
  ]);
  expect(imported.templates.map((item) => item.id)).toEqual(["standard", "coding"]);
  expect(imported.templates[0]?.presetId).toBe("standard");
  const renamed = importTemplatesFromPresets(imported, [{ id: "standard", name: "标准" }]);
  expect(renamed.templates.find((item) => item.id === "standard")?.name).toBe("标准");
});

test("legacy registry versions are rejected", () => {
  const parsed = parseRegistry(
    JSON.stringify({
      version: 2,
      templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
      bots: [],
      dialogues: [],
    }),
  );
  expect(parsed.ok).toBe(false);
  if (parsed.ok) return;
  expect(parsed.message).toContain("bots.json");
});

test("a missing registry starts empty and commits stay serial", async () => {
  const store = memoryStore(null);
  const repo = new BotRegistryRepository(store);
  const loaded = await repo.load();
  expect(loaded.corrupt).toBe(null);
  expect(loaded.registry.templates).toHaveLength(0);
  expect(loaded.registry.dialogues).toHaveLength(0);

  await Promise.all([
    repo.commit((registry) => createTemplate(registry, { name: "A", presetId: "one" }, "a")),
    repo.commit((registry) => createTemplate(registry, { name: "B", presetId: "two" }, "b")),
  ]);
  const parsed = parseRegistry(store.text() ?? "");
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(parsed.registry.templates.map((item) => item.id).sort()).toEqual(["a", "b"]);
  expect(parsed.registry.version).toBe(3);
});
