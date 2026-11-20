import { expect, test } from "nsh/test";

import { emptyRegistry } from "../../features/bots/model";
import { registry } from "../../features/bots/state";
import { t } from "../../lib/i18n";
import { archiveBot, createBot, createTemplate, mainBot } from "../../test/bots-fixture";
import { contextEntries } from "./navMenu";
import { setPins } from "./pins";

function ada() {
  const created = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  return createBot(created, { name: "Ada", templateId: "tmpl" }, "bot");
}

function labels(entries: ReturnType<typeof contextEntries>): string[] {
  return entries.flatMap((entry) => (entry.kind === "item" ? [t(entry.label)] : []));
}

test("a Bot's row offers its own verbs: Pin, details, rename, archive", () => {
  registry.set(ada());
  setPins([]);
  try {
    expect(labels(contextEntries(registry().bots[0]!, { pinned: false }))).toEqual([
      t("menu.pin"),
      t("menu.botDetails"),
      t("menu.rename"),
      t("menu.archive"),
    ]);
    expect(labels(contextEntries(registry().bots[0]!, { pinned: true }))[0]).toBe(t("menu.unpin"));
  } finally {
    registry.set(emptyRegistry());
    setPins([]);
  }
});

test("the Main Bot has no archive verb", () => {
  const seeded = mainBot();
  registry.set(seeded);
  try {
    const shown = labels(contextEntries(seeded.bots[0]!, { pinned: false }));
    expect(shown).toContain(t("menu.rename"));
    expect(shown).not.toContain(t("menu.archive"));
    expect(shown).not.toContain(t("menu.unarchive"));
  } finally {
    registry.set(emptyRegistry());
  }
});

test("an archived Bot offers the way back", () => {
  const archived = archiveBot(ada(), "bot");
  registry.set(archived);
  try {
    expect(labels(contextEntries(archived.bots[0]!, { pinned: false }))).toContain(
      t("menu.unarchive"),
    );
  } finally {
    registry.set(emptyRegistry());
  }
});

test("a row without a Bot has no menu", () => {
  expect(contextEntries(null, { pinned: false })).toEqual([]);
});
