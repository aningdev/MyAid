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
import { workspaces } from "../../features/workspace/state";
import { workspaceProjection, workspaceRow } from "../../test/workspaces";
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
      { botId: "bot", workspaceId: "ws-myaid" },
      "dlg",
    ),
    "dlg",
    "s1",
  );
}

const WORKS = workspaceProjection({
  rows: [workspaceRow({ id: "ws-myaid", path: "/work/myaid", title: "myaid", sessionIds: ["s1"] })],
});

function labels(entries: ReturnType<typeof contextEntries>): string[] {
  return entries.flatMap((entry) => (entry.kind === "item" ? [entry.label] : []));
}

test("Bot, Dialogue and Session rows get the actions of their object", () => {
  registry.set(sample());
  workspaces.set(WORKS);
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
            title: "myaid",
            botId: "bot",
            botName: "Ada",
          }),
        ),
      ),
    ).toEqual(["New Session", "Rename…"]);
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
    workspaces.set(workspaceProjection());
    setFavorites([]);
  }
});

test("a Session pinned in dsh reads Remove from Favorites", () => {
  registry.set(sample());
  workspaces.set(
    workspaceProjection({
      rows: [workspaceRow({ id: "ws-myaid", path: "/work/myaid", title: "myaid" })],
      pinned: ["s1"],
    }),
  );
  const address = sessionAddress({
    sessionId: "s1",
    label: "First run",
    botId: "bot",
    dialogueId: "dlg",
  });
  try {
    expect(labels(contextEntries(address))).toContain("Remove from Favorites");
  } finally {
    registry.set(emptyRegistry());
    workspaces.set(workspaceProjection());
  }
});
