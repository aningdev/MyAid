import { expect, test } from "nsh/test";

import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  type BotRegistry,
} from "../../features/bots/model";
import { registry } from "../../features/bots/state";
import { setFavorites } from "./favorites";
import { botAddress, dialogueAddress, sessionAddress } from "./navAddresses";
import { contextEntries } from "./navMenu";

function sample(): BotRegistry {
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

function labels(entries: ReturnType<typeof contextEntries>): string[] {
  return entries.flatMap((entry) => (entry.kind === "item" ? [entry.label] : []));
}

test("Bot, Dialogue and Session rows get the actions of their object", () => {
  registry.set(sample());
  setFavorites([]);
  try {
    expect(labels(contextEntries(botAddress({ id: "bot", name: "Ada" })))).toEqual([
      "Bot Settings…",
      "New Dialogue…",
      "Delete Bot",
    ]);
    expect(
      labels(
        contextEntries(
          dialogueAddress({
            id: "dlg",
            workspacePath: "/work/myaid",
            botId: "bot",
            botName: "Ada",
          }),
        ),
      ),
    ).toEqual(["New Session", "Rename…", "Archive Dialogue"]);
    expect(
      labels(
        contextEntries(
          sessionAddress({ sessionId: "s1", label: "First run", botId: "bot", dialogueId: "dlg" }),
        ),
      ),
    ).toEqual(["Rename…", "Add to Favorites", "Archive Session"]);

    // A Bot that has had a Dialogue cannot be deleted; the item says so.
    const botDelete = contextEntries(botAddress({ id: "bot", name: "Ada" })).find(
      (entry) => entry.kind === "item" && entry.id === "bot-delete",
    );
    expect(botDelete?.kind === "item" ? botDelete.disabled : null).toBe(true);
  } finally {
    registry.set(emptyRegistry());
    setFavorites([]);
  }
});

test("a pinned Session's menu offers to unpin it", () => {
  registry.set(sample());
  const address = sessionAddress({
    sessionId: "s1",
    label: "First run",
    botId: "bot",
    dialogueId: "dlg",
  });
  setFavorites([address]);
  try {
    expect(labels(contextEntries(address))).toContain("Remove from Favorites");
  } finally {
    registry.set(emptyRegistry());
    setFavorites([]);
  }
});
