import { expect, test } from "nsh/test";

import { archiveBot, createBot, createTemplate, emptyRegistry } from "../../features/bots/model";
import { registry } from "../../features/bots/state";
import { contextEntries } from "./navMenu";
import { setPins } from "./pins";

function ada() {
  const created = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  return createBot(created, { name: "Ada", templateId: "tmpl" }, "bot");
}

function labels(entries: ReturnType<typeof contextEntries>): string[] {
  return entries.flatMap((entry) => (entry.kind === "item" ? [entry.label] : []));
}

test("a Bot's row offers its own verbs: Pin, details, rename, archive", () => {
  registry.set(ada());
  setPins([]);
  try {
    expect(labels(contextEntries(registry().bots[0]!, { pinned: false }))).toEqual([
      "Pin",
      "Bot details…",
      "Rename…",
      "Archive",
    ]);
    expect(labels(contextEntries(registry().bots[0]!, { pinned: true }))[0]).toBe("Unpin");
  } finally {
    registry.set(emptyRegistry());
    setPins([]);
  }
});

test("an archived Bot offers the way back", () => {
  const archived = archiveBot(ada(), "bot");
  registry.set(archived);
  try {
    expect(labels(contextEntries(archived.bots[0]!, { pinned: false }))).toContain("Unarchive");
  } finally {
    registry.set(emptyRegistry());
  }
});

test("a row without a Bot has no menu", () => {
  expect(contextEntries(null, { pinned: false })).toEqual([]);
});
