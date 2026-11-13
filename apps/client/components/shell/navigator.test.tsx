/**
 * Navigator interaction: the filter, the right-click menus (which do not
 * open the row), Favorites, rename, and the ⌘K palette's jumps. The registry
 * is seeded through the app's storage, so no Host is involved.
 */
import { expect, test } from "nsh/test";

import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  renameClaim,
  serializeRegistry,
  type BotRegistry,
} from "../../features/bots/model";
import { REGISTRY_STORAGE_KEY } from "../../features/bots/store";
import { open } from "../../test/open";
import { workspaceStorage, workspaceRow } from "../../test/workspaces";
import { sessionAddress } from "./navAddresses";
import { emptyShellPrefs, serializeShellPrefs, SHELL_PREFS_STORAGE } from "./prefs";

const desktop = { platform: "web" as const, width: 1100, height: 800 };

/** Ada → one Dialogue at /work/myaid → one claimed Session; Bo has no Dialogue. */
function sample(): BotRegistry {
  const created = claimSession(
    createDialogue(
      initializeBot(
        createBot(
          createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
          { name: "Ada", templateId: "tmpl" },
          "bot",
        ),
        "bot",
      ),
      { botId: "bot", workspaceId: "ws-work" },
      "dlg",
    ),
    "dlg",
    "s1",
  );
  const renamed = renameClaim(created, "dlg", "s1", "First run");
  return createBot(renamed, { name: "Bo", templateId: "tmpl" }, "bot2");
}

function expandedPrefs(): string {
  const prefs = emptyShellPrefs();
  // Open the sample Bot's Dialogue so its Session row is in the tree.
  prefs.nav.expanded = [...prefs.nav.expanded, "bots:bot", "dialogues:dlg"];
  return serializeShellPrefs(prefs);
}

function start(options: { prefs?: string; pinned?: string[] } = {}) {
  return open("../../App.tsx", {
    ...desktop,
    storage: {
      [REGISTRY_STORAGE_KEY]: serializeRegistry(sample()),
      [SHELL_PREFS_STORAGE]: options.prefs ?? expandedPrefs(),
      ...workspaceStorage({
        rows: [
          workspaceRow({ id: "ws-work", path: "/work/myaid", title: "myaid", sessionIds: ["s1"] }),
        ],
        ...(options.pinned ? { pinned: options.pinned } : {}),
      }),
    },
  });
}

function sessionAddressOf() {
  return sessionAddress({
    sessionId: "s1",
    label: "First run",
    botId: "bot",
    dialogueId: "dlg",
  });
}

test("a Session pinned in dsh's Workspace stands in Favorites", async () => {
  const app = await start({ pinned: ["s1"] });
  // The Dialogues section and Favorites both show it (Bots is folded one level up).
  await app.waitUntil(() => app.count("role:treeitem[First run]") === 2, { timeout: 5000 });
  const texts = app.texts();
  // Favorites is the first section, so its row comes before the Dialogues one.
  const first = texts.findIndex((text) => text === "First run");
  const dialogues = texts.indexOf("Dialogues");
  expect(first).toBeGreaterThanOrEqual(0);
  expect(first).toBeLessThan(dialogues);
});

test("the filter narrows the tree to matching Bots, Dialogues and Sessions", async () => {
  const app = await start();
  await app.waitFor("role:treeitem[First run]");
  expect(app.shows("role:treeitem[Bo]")).toBe(true);

  await app.type("id:nav-search", "First run");
  await app.waitFor("role:treeitem[First run]");
  expect(app.shows("role:treeitem[Bo]")).toBe(false);
  expect(app.shows("role:treeitem[Ada]")).toBe(true);

  await app.clear("id:nav-search");
  await app.waitFor("role:treeitem[Bo]");
  expect(app.shows("role:treeitem[Bo]")).toBe(true);
});

test("a row's context menu acts on that row and does not open it", async () => {
  const app = await start();
  await app.waitFor("role:treeitem[First run]");

  await app.rightClick("text:First run >> nth=0");
  // The ContextMenu is the app's own popup: its items are on screen.
  expect(app.texts()).toContain("Rename…");
  expect(app.texts()).toContain("Add to Favorites");
  expect(app.texts()).toContain("Archive Session");
  // The right click opened no Panel: the Workbench is still empty.
  expect(app.shows("id:tab-panel-1 >> text:Empty")).toBe(true);

  // Pinning goes to dsh's Workspace. With no Host the call is refused, the
  // row stays, and the refusal is what the shell shows.
  await app.press("text:Add to Favorites");
  await app.waitFor("id:action-error-notice");
  expect(app.count("role:treeitem[First run]")).toBe(1);

  await app.rightClick("text:First run >> nth=0");
  await app.press("text:Archive Session");
  // Same refusal for the archive: dsh owns it, and it is not running here.
  await app.waitFor("id:action-error-notice");
  expect(app.count("role:treeitem[First run]")).toBe(1);
});

test("renaming a Session from its menu relabels the row", async () => {
  const app = await start();
  await app.waitFor("role:treeitem[First run]");

  await app.rightClick("text:First run >> nth=0");
  await app.press("text:Rename…");
  await app.waitFor("id:rename-sheet");
  await app.clear("id:rename-name");
  await app.type("id:rename-name", "Release notes");
  await app.press("label:Save");
  await app.waitFor("role:treeitem[Release notes]");
  expect(app.shows("role:treeitem[First run]")).toBe(false);
});

test("the palette jumps to a Session by its title", async () => {
  const app = await start();
  await app.waitFor("role:treeitem[First run]");

  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", "First run");
  await app.keyboard.press("enter");
  await app.waitUntil(() => !app.shows("id:command-palette"));
  await app.waitFor("id:chat");
  expect(app.shows("id:tab-panel-1 >> text:First run")).toBe(true);
});

test("the palette runs a command from the same table", async () => {
  const app = await start();
  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", "Toggle Navigator");
  await app.keyboard.press("enter");
  await app.waitFor("label:Expand navigator");
  expect(app.shows("role:treeitem[First run]")).toBe(false);
});

test("the launch restores the layout, panel address, folds and pins", async () => {
  const prefs = emptyShellPrefs();
  prefs.nav.width = 300;
  prefs.nav.expanded = [
    "root:favorites",
    "root:mail",
    "root:bots",
    "bots:bot",
    "root:dialogues",
    "dialogues:dlg",
  ];
  prefs.favorites = [sessionAddressOf()];
  prefs.workbench = {
    layout: { center: { type: "tabs", panels: ["p1"], activeIndex: 0 } },
    contents: { p1: sessionAddressOf() },
    activePanelId: "p1",
  };
  const app = await start({ prefs: serializeShellPrefs(prefs) });
  await app.waitFor("id:chat");
  expect(app.shows("id:tab-p1 >> text:First run")).toBe(true);
  // Mail is expanded from the stored folds, and the pin is in Favorites.
  expect(app.shows("role:treeitem[Personal]")).toBe(true);
  expect(app.count("role:treeitem[First run]")).toBe(2);
});

test("the launch restores a collapsed Navigator", async () => {
  const prefs = emptyShellPrefs();
  prefs.nav.open = false;
  const app = await start({ prefs: serializeShellPrefs(prefs) });
  await app.waitFor("label:Expand navigator");
  expect(app.shows("id:nav-search")).toBe(false);
});

test("a restored address whose object is gone degrades to an empty Panel", async () => {
  const prefs = emptyShellPrefs();
  prefs.workbench = {
    layout: { center: { type: "tabs", panels: ["p1"], activeIndex: 0 } },
    contents: {
      p1: {
        id: "bot:gone",
        root: "bots",
        path: ["Gone"],
        title: "Gone",
        kind: "bot",
        botId: "gone",
      },
    },
    activePanelId: "p1",
  };
  const app = await start({ prefs: serializeShellPrefs(prefs) });
  await app.waitFor("text:Empty panel");
  expect(app.shows("id:tab-p1 >> text:Empty")).toBe(true);
  expect(app.shows("id:chat")).toBe(false);
});
