import { expect, test } from "nsh/test";

import { defaultIdentity } from "./identity";
import {
  assignDerivedPreset,
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  deleteBot,
  deleteTemplate,
  dialogueOfWorkspace,
  emptyRegistry,
  importTemplatesFromPresets,
  initializeBot,
  parseRegistry,
  presetBinding,
  presetForBot,
  RegistryRejection,
  releaseClaim,
  renameClaim,
  serializeRegistry,
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
  return createDialogue(registry, { botId: "bot", workspaceId: "ws-work" }, "dlg");
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

test("creating a dialogue requires a dsh Workspace id", () => {
  const registry = initializeBot(codingDraft(), "bot");
  expect(() => createDialogue(registry, { botId: "bot", workspaceId: "  " }, "dlg")).toThrow(
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
  expect(registry.dialogues[0]?.workspaceId).toBe("ws-work");
  registry = claimSession(registry, "dlg", "s1");
  expect(registry.dialogues[0]?.claims).toHaveLength(1);
  registry = releaseClaim(registry, "dlg", "s1");
  expect(registry.dialogues[0]?.claims).toHaveLength(0);
  expect(() => deleteBot(registry, "bot")).toThrow(RegistryRejection);
  expect(() => claimSession(initializeBot(codingDraft(), "bot"), "missing", "s2")).toThrow(
    RegistryRejection,
  );
});

test("a Dialogue is one Bot's view of one Workspace", () => {
  let registry = claimSession(readyWithDialogue(), "dlg", "s1");
  // Two Bots on one Workspace: two Dialogues, one Workspace id, separate claims.
  registry = createDialogue(
    initializeBot(createBot(registry, { name: "Bea", templateId: "tmpl" }, "bea"), "bea"),
    { botId: "bea", workspaceId: "ws-work" },
    "dlg2",
  );
  expect(registry.dialogues.map((item) => item.workspaceId)).toEqual(["ws-work", "ws-work"]);
  expect(dialogueOfWorkspace(registry, "bot", "ws-work")?.id).toBe("dlg");
  expect(dialogueOfWorkspace(registry, "bea", "ws-work")?.id).toBe("dlg2");
  expect(dialogueOfWorkspace(registry, "bot", "ws-other")).toBe(null);
  // A Session belongs to one Dialogue, even when both look at one Workspace.
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
  expect(loaded.legacy).toBe(null);
  expect(loaded.registry.templates).toHaveLength(0);
  expect(loaded.registry.dialogues).toHaveLength(0);

  await Promise.all([
    repo.commit((registry) => createTemplate(registry, { name: "A", presetId: "one" }, "a")),
    repo.commit((registry) => createTemplate(registry, { name: "B", presetId: "two" }, "b")),
  ]);
  const parsed = parseRegistry(store.text() ?? "");
  expect(parsed.ok).toBe(true);
  if (!parsed.ok || parsed.state !== "current") return;
  expect(parsed.registry.templates.map((item) => item.id).sort()).toEqual(["a", "b"]);
  expect(parsed.registry.version).toBe(5);
});

test("Bot preferences — description, thinking, default workspace — round-trip and stay optional", () => {
  let registry = createBot(
    createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
    {
      name: "Ada",
      description: "Keeps the release branch tidy",
      templateId: "tmpl",
      defaultModel: "deepseek/deepseek-chat",
      defaultThinking: "high",
      defaultWorkspacePath: "/work/myaid",
    },
    "bot",
  );
  registry = updateBot(registry, "bot", { defaultThinking: "low" });
  const parsed = parseRegistry(serialize(registry));
  expect(parsed.ok).toBe(true);
  const bot = parsed.ok && parsed.state === "current" ? parsed.registry.bots[0] : undefined;
  expect(bot?.description).toBe("Keeps the release branch tidy");
  expect(bot?.defaultThinking).toBe("low");
  expect(bot?.defaultWorkspacePath).toBe("/work/myaid");

  // A v5 file written before these preferences existed still loads, as null.
  const older = JSON.parse(serialize(registry)) as {
    bots: Record<string, unknown>[];
  };
  delete older.bots[0]!.description;
  delete older.bots[0]!.defaultThinking;
  delete older.bots[0]!.defaultWorkspacePath;
  const legacy = parseRegistry(JSON.stringify(older));
  expect(legacy.ok).toBe(true);
  const restored = legacy.ok && legacy.state === "current" ? legacy.registry.bots[0] : undefined;
  expect(restored?.description).toBe(null);
  expect(restored?.defaultThinking).toBe(null);
  expect(restored?.defaultWorkspacePath).toBe(null);
});

test("a v4 registry is read as legacy: its Dialogues still own path, name and archive", () => {
  const v4 = {
    version: 4,
    templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
    bots: [
      {
        id: "bot",
        name: "Ada",
        templateId: "tmpl",
        defaultModel: null,
        hadDialogue: true,
        status: "ready",
        boundPresetId: "standard",
        derivedPresetId: null,
        identity: defaultIdentity("bot"),
      },
    ],
    dialogues: [
      {
        id: "dlg",
        botId: "bot",
        workspacePath: "/work",
        name: "Release notes",
        archived: false,
        claims: [{ sessionId: "s1", title: "First run", archived: true }],
      },
    ],
  };

  const parsed = parseRegistry(JSON.stringify(v4));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok || parsed.state !== "legacy") return;
  expect(parsed.legacy.dialogues[0]?.workspacePath).toBe("/work");
  expect(parsed.legacy.dialogues[0]?.name).toBe("Release notes");
  expect(parsed.legacy.dialogues[0]?.claims[0]?.archived).toBe(true);
  expect(parsed.legacy.bots[0]?.identity).toEqual(defaultIdentity("bot"));
});

test("a v3 registry is read as legacy: identity derived, no name, no archived claim", () => {
  const v3 = {
    version: 3,
    templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
    bots: [
      {
        id: "bot",
        name: "Ada",
        templateId: "tmpl",
        defaultModel: null,
        hadDialogue: true,
        status: "ready",
        boundPresetId: "standard",
        derivedPresetId: null,
      },
    ],
    dialogues: [
      {
        id: "dlg",
        botId: "bot",
        workspacePath: "/work",
        archived: false,
        claims: [{ sessionId: "s1", title: "First run" }],
      },
    ],
  };

  const parsed = parseRegistry(JSON.stringify(v3));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok || parsed.state !== "legacy") return;
  // The mark is derived from the Bot's id, so every read agrees.
  expect(parsed.legacy.bots[0]?.identity).toEqual(defaultIdentity("bot"));
  expect(parsed.legacy.dialogues[0]?.name).toBe(null);
  expect(parsed.legacy.dialogues[0]?.claims[0]?.archived).toBe(false);
});

test("a v5 registry round-trips with its Workspace ids and claims", () => {
  let registry = claimSession(readyWithDialogue(), "dlg", "s1");
  registry = renameClaim(registry, "dlg", "s1", "Release notes");
  const parsed = parseRegistry(serializeRegistry(registry));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok || parsed.state !== "current") return;
  expect(parsed.registry.dialogues[0]?.workspaceId).toBe("ws-work");
  expect(parsed.registry.dialogues[0]?.claims[0]).toEqual({
    sessionId: "s1",
    title: "Release notes",
  });
});

test("a v4 file is never written over by a commit; only a migration replaces it", async () => {
  const v4 = {
    version: 4,
    templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
    bots: [],
    dialogues: [],
  };
  const store = memoryStore(JSON.stringify(v4));
  const repo = new BotRegistryRepository(store);
  const loaded = await repo.load();
  expect(loaded.legacy).not.toBe(null);
  await expect(
    repo.commit((registry) => createTemplate(registry, { name: "A", presetId: "one" }, "a")),
  ).rejects.toMatchObject({ issue: { code: "legacy-version" } });
  expect(store.text()).toBe(JSON.stringify(v4));

  const migrated = await repo.replace(emptyRegistry());
  expect(migrated.version).toBe(5);
  // The pre-migration text is kept beside the new file.
  expect(store.backupText()).toBe(JSON.stringify(v4));
  expect(store.text()).toContain('"version": 5');
});

test("a Bot's identity round-trips; an unknown one falls back to the default", () => {
  let registry = createBot(
    createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
    { name: "Ada", templateId: "tmpl", identity: { color: "rose", glyph: "orbit" } },
    "bot",
  );
  const parsed = parseRegistry(serializeRegistry(registry));
  expect(
    parsed.ok && parsed.state === "current" ? parsed.registry.bots[0]?.identity : null,
  ).toEqual({
    color: "rose",
    glyph: "orbit",
  });

  const broken = JSON.parse(serializeRegistry(registry)) as {
    bots: { identity: { color: string; glyph: string } }[];
  };
  broken.bots[0]!.identity = { color: "burgundy", glyph: "hexagon" };
  const fallback = parseRegistry(JSON.stringify(broken));
  expect(
    fallback.ok && fallback.state === "current" ? fallback.registry.bots[0]?.identity : null,
  ).toEqual(defaultIdentity("bot"));
  registry = parsed.ok && parsed.state === "current" ? parsed.registry : registry;
  expect(registry.bots[0]?.identity.color).toBe("rose");
});

test("a claim carries the person's own title and can leave a Dialogue", () => {
  let registry = claimSession(readyWithDialogue(), "dlg", "s1");
  registry = renameClaim(registry, "dlg", "s1", "Release notes");
  expect(registry.dialogues[0]?.claims[0]?.title).toBe("Release notes");
  registry = renameClaim(registry, "dlg", "s1", "  ");
  expect(registry.dialogues[0]?.claims[0]?.title).toBe(null);
  expect(() => releaseClaim(registry, "dlg", "s2")).toThrow(RegistryRejection);
});

function serialize(registry: ReturnType<typeof emptyRegistry>): string {
  return `${JSON.stringify(registry, null, 2)}\n`;
}
