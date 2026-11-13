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
import type { SessionRow } from "../../features/dialogue/session/runtime";
import type { WorkspaceProjection } from "../../features/workspace/state";
import { workspaceProjection, workspaceRow } from "../../test/workspaces";
import { sessionAddress } from "./navAddresses";
import { NEW_BOT_ITEM_ID, projectNav } from "./navData";

/** The Workspace the fixture's Dialogue reads: title "myaid", one Session. */
const WS = "ws-myaid";

function projection(
  input: { sessionIds?: string[]; archived?: string[]; pinned?: string[] } = {},
): WorkspaceProjection {
  return workspaceProjection({
    rows: [
      workspaceRow({
        id: WS,
        path: "/work/myaid",
        title: "myaid",
        sessionIds: input.sessionIds ?? ["s1"],
      }),
    ],
    ...(input.archived ? { archived: input.archived } : {}),
    ...(input.pinned ? { pinned: input.pinned } : {}),
  });
}

/** One ready Bot, one Dialogue, one claimed (titled) Session. */
function registered(): BotRegistry {
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
      { botId: "bot", workspaceId: WS },
      "dlg",
    ),
    "dlg",
    "s1",
  );
}

function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "s1",
    dialogueId: "dlg",
    botId: "bot",
    botName: "Ada",
    workspacePath: "/work/myaid",
    label: "First run",
    detail: "Ada · /work/myaid",
    missing: false,
    running: false,
    unread: false,
    attention: false,
    ...overrides,
  };
}

function section(items: ReturnType<typeof projectNav>["items"], root: string) {
  const found = items.find((item) => item.id === root);
  if (!found) throw new Error(`no ${root}`);
  return found;
}

function labels(items: { id: string; label: string }[] | undefined) {
  return (items ?? []).map((item) => item.label);
}

test("the Bots section is Bot → Dialogue → claimed Session", () => {
  const nav = projectNav({ registry: registered(), workspaces: projection(), rows: [row()] });
  const bots = section(nav.items, "root:bots");
  expect(labels(bots.children)).toEqual(["Ada"]);
  expect(labels(bots.children?.[0]?.children)).toEqual(["myaid"]);
  // The roster's title wins over the claim's blank title.
  expect(labels(bots.children?.[0]?.children?.[0]?.children)).toEqual(["First run"]);
});

test("the Dialogues section holds every active Dialogue, labelled Bot · workspace", () => {
  const nav = projectNav({ registry: registered(), workspaces: projection(), rows: [row()] });
  const dialogues = section(nav.items, "root:dialogues");
  expect(labels(dialogues.children)).toEqual(["Ada · myaid"]);
  expect(labels(dialogues.children?.[0]?.children)).toEqual(["First run"]);
});

test("addresses carry the real ids, shared by both sections", () => {
  const nav = projectNav({ registry: registered(), workspaces: projection(), rows: [row()] });

  const bot = nav.actions.get("bots:bot");
  expect(bot).toMatchObject({ type: "address", address: { id: "bot:bot", kind: "bot" } });
  if (bot?.type !== "address") throw new Error("not an address");
  expect(bot.address.botId).toBe("bot");

  for (const id of ["bots:bot/dlg", "dialogues:dlg"]) {
    const action = nav.actions.get(id);
    if (action?.type !== "address") throw new Error(`${id} is not an address`);
    expect(action.address.id).toBe("dialogue:dlg");
    expect(action.address.dialogueId).toBe("dlg");
    expect(action.address.title).toBe("Ada · myaid");
  }

  for (const id of ["bots:bot/dlg/s1", "dialogues:dlg/s1"]) {
    const action = nav.actions.get(id);
    if (action?.type !== "address") throw new Error(`${id} is not an address`);
    expect(action.address.id).toBe("session:s1");
    expect(action.address.sessionId).toBe("s1");
    expect(action.address.dialogueId).toBe("dlg");
    expect(action.address.botId).toBe("bot");
  }
  // One address behind two tree rows: either press opens the same Panel.
  expect(nav.addresses.get("dialogue:dlg")?.title).toBe("Ada · myaid");
});

test("without a roster row a claim falls back to its own title", () => {
  const nav = projectNav({ registry: registered(), workspaces: projection(), rows: [] });
  expect(labels(section(nav.items, "root:dialogues").children?.[0]?.children)).toEqual([
    "未命名上下文",
  ]);
});

test("Session status decorates the leaf and both ancestor rows", () => {
  const nav = projectNav({
    registry: registered(),
    workspaces: projection(),
    rows: [row({ running: true, unread: true, attention: true })],
  });
  for (const id of ["bots:bot/dlg/s1", "dialogues:dlg/s1"]) {
    expect(nav.statuses.get(id)).toEqual({ working: true, unread: true, attention: true });
  }
  for (const id of ["bots:bot/dlg", "bots:bot", "dialogues:dlg"]) {
    expect(nav.statuses.get(id)).toEqual({ working: true, unread: true, attention: true });
  }
});

test("a quiet Session adds no decoration to its ancestors", () => {
  const nav = projectNav({ registry: registered(), workspaces: projection(), rows: [row()] });
  expect(nav.statuses.size).toBe(0);
});

test("an empty registry offers the new-Bot draft instead of rows", () => {
  const nav = projectNav({ registry: emptyRegistry(), workspaces: projection(), rows: [] });
  const bots = section(nav.items, "root:bots");
  expect(labels(bots.children)).toEqual(["New Bot"]);
  expect(nav.actions.get(NEW_BOT_ITEM_ID)).toEqual({ type: "newBot" });
  expect(section(nav.items, "root:dialogues").children).toEqual([]);
});

test("dsh's Workspace order sets the Dialogue order; the parked sections keep theirs", () => {
  const second = createDialogue(registered(), { botId: "bot", workspaceId: "ws-two" }, "dlg2");
  const projection = workspaceProjection({
    rows: [
      workspaceRow({ id: "ws-two", path: "/work/two", title: "two" }),
      workspaceRow({ id: WS, path: "/work/myaid", title: "myaid", sessionIds: ["s1"] }),
    ],
  });
  const nav = projectNav({ registry: second, workspaces: projection, rows: [row()] });
  // The Workspace registered first reads first, whatever the registry order.
  expect(labels(section(nav.items, "root:dialogues").children)).toEqual([
    "Ada · two",
    "Ada · myaid",
  ]);
  expect(nav.items.map((item) => item.label)).toEqual([
    "Favorites",
    "Mail",
    "Task",
    "Knowledge",
    "Bots",
    "Dialogues",
    "Spaces",
    "Settings",
  ]);
});

test("Favorites are dsh's pinned Sessions, then the prefs' own pins", () => {
  const nav = projectNav({
    registry: registered(),
    workspaces: projection({ pinned: ["s1"] }),
    rows: [row()],
  });
  const favorites = section(nav.items, "root:favorites");
  expect(labels(favorites.children)).toEqual(["First run"]);
  expect(nav.actions.get("fav:session:s1")).toMatchObject({
    type: "address",
    address: { id: "session:s1", sessionId: "s1" },
  });

  // A prefs pin still shows when its object exists, and leaves no row when gone.
  const pinned = sessionAddress({
    sessionId: "s1",
    label: "First run",
    botId: "bot",
    dialogueId: "dlg",
  });
  const withPrefs = projectNav({
    registry: registered(),
    workspaces: projection(),
    rows: [row()],
    favorites: [pinned],
  });
  expect(labels(section(withPrefs.items, "root:favorites").children)).toEqual(["First run"]);
  const missing = projectNav({
    registry: emptyRegistry(),
    workspaces: projection(),
    rows: [],
    favorites: [pinned],
  });
  expect(section(missing.items, "root:favorites").children).toEqual([]);
});

test("the filter keeps matching Bots, Dialogues and Sessions with their context", () => {
  const nav = projectNav({
    registry: registered(),
    workspaces: projection(),
    rows: [row()],
    query: "first",
  });
  expect(nav.items.map((item) => item.label)).toEqual(["Favorites", "Bots", "Dialogues"]);
  const bots = section(nav.items, "root:bots");
  expect(labels(bots.children)).toEqual(["Ada"]);
  expect(labels(bots.children?.[0]?.children)).toEqual(["myaid"]);
  expect(labels(bots.children?.[0]?.children?.[0]?.children)).toEqual(["First run"]);
  expect(labels(section(nav.items, "root:dialogues").children)).toEqual(["Ada · myaid"]);

  // A path or a Bot's name matches its rows too.
  expect(
    labels(
      section(
        projectNav({
          registry: registered(),
          workspaces: projection(),
          rows: [row()],
          query: "/work",
        }).items,
        "root:bots",
      ).children,
    ),
  ).toEqual(["Ada"]);
  expect(
    labels(
      section(
        projectNav({
          registry: registered(),
          workspaces: projection(),
          rows: [row()],
          query: "ada",
        }).items,
        "root:bots",
      ).children,
    ),
  ).toEqual(["Ada"]);

  // Nothing matches: both sections are empty (and the parked sections stay out).
  const none = projectNav({
    registry: registered(),
    workspaces: projection(),
    rows: [row()],
    query: "nothing",
  });
  expect(section(none.items, "root:bots").children).toEqual([]);
  expect(section(none.items, "root:dialogues").children).toEqual([]);
  expect(none.items.map((item) => item.label)).toEqual(["Favorites", "Bots", "Dialogues"]);
});

test("a Session dsh archived leaves the tree while the claim stays", () => {
  const registry = registered();
  const nav = projectNav({
    registry,
    workspaces: projection({ archived: ["s1"] }),
    rows: [row()],
  });
  expect(section(nav.items, "root:bots").children?.[0]?.children?.[0]?.children).toEqual([]);
  expect(section(nav.items, "root:dialogues").children?.[0]?.children).toEqual([]);
  // The registry still holds the claim, so an unarchive brings it back.
  expect(registry.dialogues[0]?.claims[0]?.sessionId).toBe("s1");
});

test("two Dialogues on one title read apart, in both sections", () => {
  const second = createDialogue(registered(), { botId: "bot", workspaceId: WS }, "dlg2");
  const nav = projectNav({
    registry: second,
    workspaces: projection(),
    rows: [] as SessionRow[],
  });
  const labels: string[] = [];
  const walk = (items: typeof nav.items) => {
    for (const item of items) {
      labels.push(item.label);
      if (item.children) walk(item.children);
    }
  };
  walk(nav.items);
  expect(labels).toContain("myaid · 1");
  expect(labels).toContain("myaid · 2");
  expect(labels).toContain("Ada · myaid · 1");
  expect(labels).toContain("Ada · myaid · 2");
});
