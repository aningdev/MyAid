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
    ).toEqual(["New Session", "Rename…", "Archive Dialogue", "Remove Dialogue"]);
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

    // A Dialogue with claims cannot be removed; an empty one can.
    const dialogue = dialogueAddress({ id: "dlg", title: "myaid", botId: "bot", botName: "Ada" });
    const remove = contextEntries(dialogue).find(
      (entry) => entry.kind === "item" && entry.id === "dialogue-remove",
    );
    expect(remove?.kind === "item" ? remove.disabled : null).toBe(true);
  } finally {
    registry.set(emptyRegistry());
    workspaces.set(workspaceProjection());
    setFavorites([]);
  }
});

test("an empty Dialogue can be removed, and an all-archived one says so", () => {
  registry.set(sample());
  workspaces.set(
    workspaceProjection({
      rows: [workspaceRow({ id: "ws-myaid", path: "/work/myaid", title: "myaid" })],
      archived: ["s1"],
    }),
  );
  const dialogue = dialogueAddress({ id: "dlg", title: "myaid", botId: "bot", botName: "Ada" });
  try {
    // Every Session archived: the archive action is done, remove is still refused.
    const entries = contextEntries(dialogue);
    const archive = entries.find(
      (entry) => entry.kind === "item" && entry.id === "dialogue-archive",
    );
    const remove = entries.find((entry) => entry.kind === "item" && entry.id === "dialogue-remove");
    expect(archive?.kind === "item" ? archive.disabled : null).toBe(true);
    expect(remove?.kind === "item" ? remove.disabled : null).toBe(true);
  } finally {
    registry.set(emptyRegistry());
    workspaces.set(workspaceProjection());
  }

  const empty = createDialogue(sample(), { botId: "bot", workspaceId: "ws-two" }, "dlg2");
  registry.set(empty);
  workspaces.set(
    workspaceProjection({
      rows: [
        workspaceRow({ id: "ws-myaid", path: "/work/myaid", title: "myaid", sessionIds: ["s1"] }),
        workspaceRow({ id: "ws-two", path: "/work/two", title: "two" }),
      ],
    }),
  );
  try {
    const entries = contextEntries(
      dialogueAddress({ id: "dlg2", title: "two", botId: "bot", botName: "Ada" }),
    );
    const remove = entries.find((entry) => entry.kind === "item" && entry.id === "dialogue-remove");
    expect(remove?.kind === "item" ? remove.disabled : null).toBe(false);
  } finally {
    registry.set(emptyRegistry());
    workspaces.set(workspaceProjection());
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
