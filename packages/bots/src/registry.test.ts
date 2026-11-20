import { describe, expect, it } from "vite-plus/test";

import {
  archiveBot,
  assignDerivedPreset,
  claimSegment,
  createBot,
  createTemplate,
  defaultIdentity,
  deleteBot,
  deleteTemplate,
  ensureMainBot,
  initializeBot,
  MAIN_BOT_ID,
  releaseSegment,
  renameSegment,
  unarchiveBot,
  updateBot,
  updateTemplate,
  type BotRegistry,
} from "./registry.ts";

const preset = { id: "standard", name: "Standard" };

function registry(): BotRegistry {
  return ensureMainBot(
    createTemplate(
      { version: 6, templates: [], bots: [] },
      { id: "product", name: "Product", presetId: "standard" },
    ),
    preset,
  );
}

function draft(): BotRegistry {
  return createBot(registry(), {
    id: "bot-ada",
    name: "Ada",
    templateId: "product",
  });
}

describe("Registry writes", () => {
  it("creates a draft and initializes it against the template's preset", () => {
    const created = draft();
    const bot = created.bots.find((item) => item.id === "bot-ada")!;
    expect(bot.status).toBe("draft");
    expect(bot.boundPresetId).toBeNull();
    expect(bot.identity).toEqual(defaultIdentity("bot-ada"));

    const ready = initializeBot(created, "bot-ada");
    expect(ready.bots.find((item) => item.id === "bot-ada")).toMatchObject({
      status: "ready",
      boundPresetId: "standard",
    });
  });

  it("claims, renames and releases segments without touching older ones", () => {
    const ready = initializeBot(draft(), "bot-ada");
    const first = claimSegment(ready, "bot-ada", "session-1", "workspace-1");
    const second = claimSegment(first, "bot-ada", "session-2", "workspace-2");
    expect(second.bots.find((item) => item.id === "bot-ada")?.segments).toEqual([
      { sessionId: "session-1", workspaceId: "workspace-1", title: null },
      { sessionId: "session-2", workspaceId: "workspace-2", title: null },
    ]);

    const renamed = renameSegment(second, "bot-ada", "session-1", "  First  ");
    expect(renamed.bots.find((item) => item.id === "bot-ada")?.segments[0]?.title).toBe("First");

    const released = releaseSegment(renamed, "bot-ada", "session-1");
    const bot = released.bots.find((item) => item.id === "bot-ada")!;
    expect(bot.segments.map((segment) => segment.sessionId)).toEqual(["session-2"]);
    expect(bot.hadDialogue).toBe(true);
  });

  it("refuses to claim one Session twice or before the Bot is ready", () => {
    expect(() => claimSegment(draft(), "bot-ada", "session-1", "workspace-1")).toThrow(
      /尚未初始化/,
    );
    const ready = initializeBot(draft(), "bot-ada");
    const claimed = claimSegment(ready, "bot-ada", "session-1", "workspace-1");
    expect(() => claimSegment(claimed, "bot-ada", "session-1", "workspace-2")).toThrow(/已属于/);
  });

  it("archives and unarchives idempotently", () => {
    const ready = initializeBot(draft(), "bot-ada");
    const archived = archiveBot(archiveBot(ready, "bot-ada"), "bot-ada");
    expect(archived.bots.find((item) => item.id === "bot-ada")?.archived).toBe(true);
    const restored = unarchiveBot(archived, "bot-ada");
    expect(restored.bots.find((item) => item.id === "bot-ada")?.archived).toBe(false);
  });

  it("deletes only Bots that never had a segment", () => {
    const ready = initializeBot(draft(), "bot-ada");
    expect(() => deleteBot(ready, "bot-ada")).not.toThrow();
    const claimed = claimSegment(ready, "bot-ada", "session-1", "workspace-1");
    expect(() => deleteBot(claimed, "bot-ada")).toThrow(/已有对话/);
  });

  it("freezes the template of a ready Bot but not of a draft", () => {
    const created = createTemplate(draft(), { id: "other", name: "Other", presetId: "other" });
    expect(() => updateBot(created, "bot-ada", { templateId: "other" })).not.toThrow();
    const ready = initializeBot(draft(), "bot-ada");
    expect(() => updateBot(ready, "bot-ada", { templateId: "other" })).toThrow(/不能更换模板/);
  });

  it("keeps template ids unique and cannot delete a template in use", () => {
    const current = registry();
    expect(() => createTemplate(current, { id: "product", name: "Again", presetId: "x" })).toThrow(
      /已存在/,
    );
    const used = createBot(current, { id: "bot-ada", name: "Ada", templateId: "product" });
    expect(() => deleteTemplate(used, "product")).toThrow(/仍被 Bot 使用/);
    expect(updateTemplate(current, "product", { name: "Product 2" }).templates[0]?.name).toBe(
      "Product 2",
    );
  });

  it("records a derived preset id and resolves it before the bound one", () => {
    const ready = initializeBot(draft(), "bot-ada");
    const assigned = assignDerivedPreset(ready, "bot-ada", "bots-ada-1234");
    expect(assigned.bots.find((item) => item.id === "bot-ada")?.derivedPresetId).toBe(
      "bots-ada-1234",
    );
  });
});

describe("Main Bot", () => {
  it("is created first, ready and bound to the default preset", () => {
    const current = registry();
    expect(current.bots[0]).toMatchObject({
      id: MAIN_BOT_ID,
      name: "Main Bot",
      status: "ready",
      boundPresetId: "standard",
      archived: false,
      segments: [],
    });
  });

  it("stays first when the file lists it elsewhere and is never archived", () => {
    const current = registry();
    const moved = { ...current, bots: [...current.bots.slice(1), current.bots[0]!] };
    const ensured = ensureMainBot(moved, preset);
    expect(ensured.bots[0]?.id).toBe(MAIN_BOT_ID);
    expect(ensured.bots[0]?.archived).toBe(false);
  });

  it("rejects archiving and deleting with an explicit code", () => {
    const current = registry();
    expect(() => archiveBot(current, MAIN_BOT_ID)).toThrow(
      expect.objectContaining({ code: "bots/main-bot" }),
    );
    expect(() => deleteBot(current, MAIN_BOT_ID)).toThrow(
      expect.objectContaining({ code: "bots/main-bot" }),
    );
  });
});
