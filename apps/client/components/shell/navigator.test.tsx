/**
 * Navigator interaction: the flat Bot list (search, Pin, activity order, New
 * Bot, the Host footer), the row's context menu (Pin / Rename / Archive), the
 * archived Bot a search finds again, and the Panes a press or a drag opens.
 * The registry is seeded through the app's storage, so no Host is involved.
 */
import { expect, test } from "nsh/test";

import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  serializeRegistry,
  type BotRegistry,
} from "../../features/bots/model";
import { REGISTRY_STORAGE_KEY } from "../../features/bots/store";
import { open } from "../../test/open";
import { workspaceRow, workspaceStorage } from "../../test/workspaces";
import { emptyShellPrefs, serializeShellPrefs, SHELL_PREFS_STORAGE } from "./prefs";

const desktop = { platform: "web" as const, width: 1100, height: 800 };

/**
 * Ada (ready) → one segment at /work/dsh-bot; Bob (ready) → one segment at
 * /work/bob. Bob worked last.
 */
function sample(): BotRegistry {
  const created = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  const ada = createBot(created, { name: "Ada", templateId: "tmpl" }, "ada");
  const bob = createBot(ada, { name: "Bob", templateId: "tmpl" }, "bob");
  const withAda = claimSegment(initializeBot(bob, "ada"), "ada", "s-ada", "ws-ada");
  return claimSegment(initializeBot(withAda, "bob"), "bob", "s-bob", "ws-bob");
}

function start(options: { prefs?: string; registry?: BotRegistry; workspaces?: string[] } = {}) {
  const rows = (options.workspaces ?? ["ws-ada", "ws-bob"]).map((id) =>
    workspaceRow({
      id,
      path: `/work/${id.slice(3)}`,
      title: id.slice(3),
      sessionIds: [`s-${id.slice(3)}`],
      updatedAt: id === "ws-bob" ? "2026-02-01T00:00:00.000Z" : "2026-01-01T00:00:00.000Z",
    }),
  );
  return open("../../App.tsx", {
    ...desktop,
    storage: {
      [REGISTRY_STORAGE_KEY]: serializeRegistry(options.registry ?? sample()),
      ...(options.prefs ? { [SHELL_PREFS_STORAGE]: options.prefs } : {}),
      ...workspaceStorage({ rows }),
    },
  });
}

test("the list is search, Pin, Bots by activity, New Bot, Host and Settings", async () => {
  const app = await start();
  await app.waitFor("label:Ada");

  // The rest of the Bots: Bob worked last, so it stands first once dsh's
  // Workspace baseline (the activity) has arrived.
  await app.waitUntil(() => {
    const order = app.texts().filter((text) => text === "Ada" || text === "Bob");
    return order[0] === "Bob" && order[1] === "Ada";
  });
  const texts = app.texts();
  expect(app.shows("label:New Bot")).toBe(true);
  expect(app.shows("label:Search Bots")).toBe(true);
  expect(app.shows("label:Settings")).toBe(true);
  // The Host footer is the launcher's fact row; a test app never runs it.
  expect(app.shows("id:host-status >> text:Host disconnected")).toBe(true);
  // No domain sections, no Dialogues, no Settings group, no Session rows.
  for (const gone of ["Mail", "Task", "Knowledge", "Spaces", "Dialogues", "Favorites"]) {
    expect(texts).not.toContain(gone);
  }
  expect(app.shows("text:Pin")).toBe(false);
  expect(app.shows("text:s-ada")).toBe(false);
});

test("the search finds both live and archived Bots", async () => {
  const app = await start();
  await app.waitFor("label:Ada");

  await app.type("id:nav-search", "Bob");
  await app.waitFor("label:Bob");
  expect(app.shows("label:Ada")).toBe(false);

  await app.clear("id:nav-search");
  await app.waitFor("label:Ada");
  expect(app.shows("label:Bob")).toBe(true);
});

test("a right-click Pins a Bot into the group, and a launch keeps it", async () => {
  const app = await start();
  await app.waitFor("label:Ada");

  await app.rightClick("label:Ada");
  await app.press("text:Pin");
  await app.waitFor("text:Pin");
  // The Pin group stands above the rest, and Ada is in it.
  const texts = app.texts();
  expect(texts.indexOf("Pin")).toBeGreaterThanOrEqual(0);
  expect(texts.indexOf("Pin")).toBeLessThan(texts.indexOf("Ada"));
  // The pin is written to the client prefs (debounced).
  await app.waitUntil(() => (app.storage()[SHELL_PREFS_STORAGE] ?? "").includes('"ada"'), {
    timeout: 5000,
  });

  const prefs = app.storage()[SHELL_PREFS_STORAGE] ?? "";
  const relaunched = await start({ prefs });
  await relaunched.waitFor("label:Ada");
  const again = relaunched.texts();
  expect(again.indexOf("Pin")).toBeLessThan(again.indexOf("Ada"));
  expect(again.indexOf("Ada")).toBeLessThan(again.indexOf("Bob"));
});

test("Unpin sends the Bot back among the rest", async () => {
  const prefs = emptyShellPrefs();
  prefs.pins = ["ada"];
  const app = await start({ prefs: serializeShellPrefs(prefs) });
  await app.waitFor("text:Pin");

  await app.rightClick("label:Ada");
  await app.press("text:Unpin");
  await app.waitUntil(() => !app.shows("text:Pin"));
});

test("archiving hides a Bot, and a search brings it back to unarchive", async () => {
  const app = await start();
  await app.waitFor("label:Ada");

  await app.rightClick("label:Ada");
  await app.press("text:Archive");
  await app.waitUntil(() => !app.shows("label:Ada"));
  expect(app.shows("label:Bob")).toBe(true);

  await app.type("id:nav-search", "Ada");
  await app.waitFor("label:Unarchive Ada");
  await app.press("label:Unarchive Ada");
  await app.clear("id:nav-search");
  await app.waitFor("label:Ada");
  expect(app.storage()[REGISTRY_STORAGE_KEY]).toContain('"archived": false');
});

test("the search, the Composer and the title's field take the keys from code", async () => {
  const app = await start();
  await app.waitFor("label:Ada");

  // ⌘F asks the search field to take the keyboard; the keys then land in it,
  // not in the window (the group's control is the one with the ref).
  await app.keyboard.press("mod+f");
  await app.keyboard.press("b");
  await app.keyboard.press("o");
  await app.waitUntil(() => app.value("id:nav-search") === "bo");
  await app.clear("id:nav-search");
  await app.waitFor("label:Ada");

  // A focus request for the Session showing lands in its Composer (⌘L).
  await app.press("label:Ada");
  await app.waitFor("id:composer", { timeout: 30000 });
  // The Pane's segment knows its Session once the Workspaces have arrived, and
  // ⌘L asks for that Session's Composer.
  await app.waitFor("id:session-workspace", { timeout: 30000 });
  await app.keyboard.press("mod+l");
  await app.keyboard.press("h");
  await app.keyboard.press("i");
  await app.waitUntil(() => app.value("id:composer") === "hi");

  // A double press on the title turns it into the group's field, which has the
  // keys from the press that made it.
  const title = app.texts().find((text) => text.startsWith("Ada · "));
  expect(title).toBeDefined();
  await app.press(`id:chat >> text:${title}`);
  await app.press(`id:chat >> text:${title}`);
  await app.waitFor("id:session-title", { timeout: 10000 });
  const before = app.value("id:session-title") ?? "";
  await app.keyboard.press("x");
  await app.waitUntil(() => {
    const now = app.value("id:session-title") ?? "";
    return now.length === before.length + 1 && now.includes("x");
  });

  // The directory beside it is the same group: a press edits it, and the field
  // it makes has the keys.
  await app.keyboard.press("Escape");
  await app.press("id:session-workspace");
  await app.waitFor("id:session-workspace-input", { timeout: 10000 });
  const path = app.value("id:session-workspace-input") ?? "";
  await app.keyboard.press("y");
  await app.waitUntil(() => {
    const now = app.value("id:session-workspace-input") ?? "";
    return now.length === path.length + 1 && now.includes("y");
  });
}, 120000);

test("a press opens the Bot's Pane, a second Bot a new one", async () => {
  const app = await start();
  await app.waitFor("label:Ada");

  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");
  expect(app.count("id:tab-panel-2")).toBe(0);

  // A drag to the right lands in the Workbench as a second Pane.
  await app.drag("label:Bob", { x: 220 });
  await app.waitFor("id:tab-panel-2 >> text:Bob");
  expect(app.shows("id:tab-panel-1 >> text:Ada")).toBe(true);
});

test("a Bot already in a Pane is focused, never opened twice", async () => {
  const app = await start();
  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");
  await app.drag("label:Bob", { x: 220 });
  await app.waitFor("id:tab-panel-2 >> text:Bob");

  // The second Pane has the focus; pressing Ada puts it back on the first.
  await app.press("label:Ada");
  expect(app.count("id:tab-panel-2 >> text:Ada")).toBe(0);
  // Closing the focused Pane closes Ada's, which proves where the focus went.
  await app.keyboard.press("mod+w");
  await app.waitUntil(() => app.count("id:tab-panel-1") === 0);
  expect(app.shows("id:tab-panel-2 >> text:Bob")).toBe(true);
});

test("a launch restores the Panes and the Bots in them", async () => {
  const prefs = emptyShellPrefs();
  prefs.workbench = {
    layout: {
      center: {
        type: "split",
        axis: "horizontal",
        children: [
          { type: "tabs", panels: ["p1"], activeIndex: 0 },
          { type: "tabs", panels: ["p2"], activeIndex: 0 },
        ],
        sizes: [null, null],
      },
    },
    contents: { p1: { botId: "ada" }, p2: { botId: "bob" } },
    activePanelId: "p2",
  };
  const app = await start({ prefs: serializeShellPrefs(prefs) });
  await app.waitFor("id:tab-p1 >> text:Ada");
  await app.waitFor("id:tab-p2 >> text:Bob");
});

test("a Pane whose Bot is gone comes back empty", async () => {
  const prefs = emptyShellPrefs();
  prefs.workbench = {
    layout: { center: { type: "tabs", panels: ["p1"], activeIndex: 0 } },
    contents: { p1: { botId: "gone" } },
    activePanelId: "p1",
  };
  const app = await start({ prefs: serializeShellPrefs(prefs) });
  await app.waitFor("text:Empty panel");
  expect(app.shows("id:tab-p1 >> text:Empty")).toBe(true);
});

test("a renamed Bot retitles its list row and its Pane", async () => {
  const app = await start();
  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");

  await app.rightClick("label:Ada");
  await app.press("text:Rename…");
  await app.waitFor("id:rename-dialog");
  await app.clear("id:rename-name");
  await app.type("id:rename-name", "Ada L");
  await app.press("label:Save");
  await app.waitFor("label:Ada L");
  expect(app.shows("id:tab-panel-1 >> text:Ada L")).toBe(true);
});

test("the palette jumps to a Bot and runs a command", async () => {
  const app = await start();
  await app.waitFor("label:Ada");

  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", "Ada");
  await app.keyboard.press("enter");
  await app.waitUntil(() => !app.shows("id:command-palette"));
  await app.waitFor("id:tab-panel-1 >> text:Ada");

  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  await app.type("id:command-palette", "Toggle Navigator");
  await app.keyboard.press("enter");
  await app.waitFor("label:Expand navigator");
});

test("Settings covers the area, and Back returns to the same Panes", async () => {
  const app = await start();
  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");

  await app.press("label:Settings");
  await app.waitFor("id:settings-overlay");
  expect(app.shows("id:settings-providers")).toBe(true);
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-background");
  expect(app.texts()).toContain("Background Services");

  await app.press("label:Back to Panes");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
  await app.waitFor("id:tab-panel-1 >> text:Ada");

  // ⌘, opens it again, and Escape comes back.
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-overlay");
  await app.keyboard.press("escape");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
  expect(app.shows("id:tab-panel-1 >> text:Ada")).toBe(true);
});

test("the New Bot row opens the dialog", async () => {
  const app = await start();
  await app.press("label:New Bot");
  await app.waitFor("id:new-bot-dialog");
  expect(app.shows("id:new-bot-name")).toBe(true);
});
