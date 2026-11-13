import { expect, test } from "nsh/test";

import { archiveBot, createBot, createTemplate, emptyRegistry } from "../../features/bots/model";
import {
  emptyShellPrefs,
  parseShellPrefs,
  restoreWorkbenchSnapshot,
  serializeShellPrefs,
  type ShellPrefs,
} from "./prefs";

function sample() {
  const created = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  const withAda = createBot(created, { name: "Ada", templateId: "tmpl" }, "bot");
  return createBot(withAda, { name: "Bob", templateId: "tmpl" }, "bot2");
}

function prefsWith(contents: ShellPrefs["workbench"]["contents"]): ShellPrefs {
  return {
    ...emptyShellPrefs(),
    workbench: {
      layout: { center: { type: "tabs", panels: ["p1"], activeIndex: 0 } },
      contents,
      activePanelId: "p1",
    },
  };
}

test("no stored preferences read as the defaults", () => {
  const prefs = parseShellPrefs(null);
  expect(prefs.version).toBe(2);
  expect(prefs.pins).toEqual([]);
  expect(prefs.nav).toEqual({ width: 232, open: true });
  expect(prefs.workbench.layout.center).toMatchObject({ type: "tabs" });
});

test("preferences round-trip the layout, the Panes' Bots and the pins", () => {
  const prefs: ShellPrefs = {
    ...prefsWith({ p1: { botId: "bot" } }),
    nav: { width: 300, open: false },
    pins: ["bot2", "bot"],
  };
  const parsed = parseShellPrefs(serializeShellPrefs(prefs));
  expect(parsed.nav).toEqual({ width: 300, open: false });
  expect(parsed.pins).toEqual(["bot2", "bot"]);
  expect(parsed.workbench.contents.p1).toEqual({ botId: "bot" });
});

test("a version 1 file keeps its Bot pins and Pane Bots, and drops Session pins", () => {
  const older = JSON.stringify({
    version: 1,
    nav: { width: 268, open: true, expanded: ["root:bots"] },
    favorites: [
      { id: "bot:bot", root: "bots", path: ["Ada"], title: "Ada", kind: "bot", botId: "bot" },
      {
        id: "session:s1",
        root: "dialogues",
        path: ["First run"],
        title: "First run",
        kind: "session",
        botId: "bot2",
        dialogueId: "dlg",
        sessionId: "s1",
      },
      {
        id: "dialogue:dlg",
        root: "dialogues",
        path: ["Ada · myaid"],
        title: "Ada · myaid",
        kind: "dialogue",
        botId: "bot2",
        dialogueId: "dlg",
      },
    ],
    workbench: {
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
      contents: {
        p1: {
          id: "session:s1",
          root: "dialogues",
          path: ["First run"],
          title: "First run",
          kind: "session",
          botId: "bot",
          dialogueId: "dlg",
          sessionId: "s1",
        },
        p2: { id: "bot:gone", root: "bots", path: ["Gone"], title: "Gone", kind: "bot" },
      },
      activePanelId: "p2",
    },
  });
  const prefs = parseShellPrefs(older);
  expect(prefs.version).toBe(2);
  expect(prefs.nav.width).toBe(268);
  // Only the Bot pin is kept: a Dialogue or Session pin was a place, not a Bot.
  expect(prefs.pins).toEqual(["bot"]);
  // Each Pane opens the Bot it showed; a Bot with no id leaves it empty.
  expect(prefs.workbench.contents).toEqual({ p1: { botId: "bot" }, p2: null });
});

test("a restore empties the Panes of Bots that are gone", () => {
  const stored = {
    layout: {
      center: {
        type: "split" as const,
        axis: "horizontal" as const,
        children: [
          { type: "tabs" as const, panels: ["p1"], activeIndex: 0 },
          { type: "tabs" as const, panels: ["p2"], activeIndex: 0 },
        ],
        sizes: [null, null],
      },
    },
    contents: { p1: { botId: "bot" }, p2: { botId: "gone" } },
    activePanelId: "p2",
  };
  const restored = restoreWorkbenchSnapshot(stored, (botId) => (botId === "bot" ? botId : null));
  expect(restored.contents).toEqual({ p1: { botId: "bot" }, p2: null });
  expect(restored.activePanelId).toBe("p2");
});

test("an invalid layout degrades to one empty panel", () => {
  const prefs = parseShellPrefs(
    JSON.stringify({
      version: 2,
      nav: { width: Number.NaN, open: "yes" },
      pins: [null, 3, "bot", "bot"],
      workbench: {
        layout: { center: { type: "split", axis: "diagonal", children: [] } },
        contents: { p1: { botId: 7 } },
        activePanelId: "p1",
      },
    }),
  );
  expect(prefs.nav.width).toBe(232);
  expect(prefs.nav.open).toBe(true);
  expect(prefs.pins).toEqual(["bot"]);
  const ids =
    prefs.workbench.layout.center.type === "tabs" ? prefs.workbench.layout.center.panels : [];
  expect(ids).toHaveLength(1);
  expect(prefs.workbench.contents[ids[0]!]).toBe(null);
});

test("the appearance and language round-trip, and an older file reads the defaults", () => {
  const prefs: ShellPrefs = {
    ...emptyShellPrefs(),
    appearance: { scheme: "dark", accent: "violet", language: "en" },
  };
  const parsed = parseShellPrefs(serializeShellPrefs(prefs));
  expect(parsed.appearance).toEqual({ scheme: "dark", accent: "violet", language: "en" });

  const before = parseShellPrefs(
    JSON.stringify({
      version: 2,
      nav: { width: 232, open: true },
      pins: [],
      workbench: {
        layout: { center: { type: "tabs", panels: ["p1"], activeIndex: 0 } },
        contents: { p1: null },
        activePanelId: "p1",
      },
    }),
  );
  expect(before.appearance).toEqual({ scheme: "system", accent: "default", language: "system" });

  const invalid = parseShellPrefs(
    JSON.stringify({
      version: 2,
      appearance: { scheme: "sepia", accent: "chartreuse", language: "fr" },
      nav: { width: 232, open: true },
      pins: [],
      workbench: {
        layout: { center: { type: "tabs", panels: ["p1"], activeIndex: 0 } },
        contents: { p1: null },
        activePanelId: "p1",
      },
    }),
  );
  expect(invalid.appearance).toEqual({ scheme: "system", accent: "default", language: "system" });
});
