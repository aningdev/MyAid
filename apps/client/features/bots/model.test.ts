/**
 * Read-only Registry helpers. The plugin owns every change; these tests only
 * check how the Client reads a snapshot it was given.
 */
import { expect, test } from "nsh/test";

import { t } from "../../lib/i18n";
import {
  claimSegment,
  createBot,
  createTemplate,
  initializeBot,
  mainBot,
} from "../../test/bots-fixture";
import { emptyRegistry, isMainBot, presetBinding, presetForBot, segmentOwner } from "./model";

function codingDraft() {
  const withTemplate = createTemplate(
    emptyRegistry(),
    { name: "Coding", presetId: "standard" },
    "tmpl",
  );
  return createBot(withTemplate, { name: "Ada", templateId: "tmpl" }, "bot");
}

test("a draft follows the template preset", () => {
  const registry = codingDraft();
  expect(presetForBot(registry, "bot")).toBe("standard");
  expect(presetBinding(registry.bots[0]!, registry.templates[0]!).binding).toBe("inherit");
});

test("a ready Bot keeps the preset it bound, then a derived preset", () => {
  const ready = initializeBot(codingDraft(), "bot");
  expect(presetBinding(ready.bots[0]!, ready.templates[0]!).binding).toBe("bound");
  expect(presetForBot(ready, "bot")).toBe("standard");
  const custom = {
    ...ready,
    bots: ready.bots.map((bot) => ({ ...bot, derivedPresetId: "bots-bot" })),
  };
  expect(presetBinding(custom.bots[0]!, custom.templates[0]!).binding).toBe("custom");
  expect(presetForBot(custom, "bot")).toBe("bots-bot");
});

test("a missing template is named when nothing else is bound", () => {
  const registry = codingDraft();
  expect(() => presetForBot({ ...registry, templates: [] }, "bot")).toThrow(
    t("registry.templateGone"),
  );
  expect(() => presetBinding(registry.bots[0]!, null)).toThrow(t("registry.templateGone"));
});

test("an unknown Bot cannot resolve a preset", () => {
  expect(() => presetForBot(emptyRegistry(), "missing")).toThrow(t("workspace.botMissing"));
});

test("segmentOwner finds the Bot that claimed a Session", () => {
  const registry = claimSegment(initializeBot(codingDraft(), "bot"), "bot", "s1", "ws-work");
  expect(segmentOwner(registry, "s1")?.bot.id).toBe("bot");
  expect(segmentOwner(registry, "s1")?.segment.workspaceId).toBe("ws-work");
  expect(segmentOwner(registry, "missing")).toBeNull();
});

test("isMainBot matches the plugin's Main Bot id", () => {
  const registry = mainBot();
  expect(isMainBot(registry.bots[0]!)).toBe(true);
  expect(registry.bots[0]?.id).toBe("bots-main");
  expect(isMainBot({ id: "ada" })).toBe(false);
});
