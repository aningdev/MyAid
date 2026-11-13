import { expect, test } from "nsh/test";

import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  renameClaim,
  type BotRegistry,
} from "../../features/bots/model";
import type { WorkspaceProjection } from "../../features/workspace/state";
import { workspaceProjection, workspaceRow } from "../../test/workspaces";
import { botAddress, dialogueAddress, sessionAddress } from "./navAddresses";
import {
  emptyShellPrefs,
  parseShellPrefs,
  resolveAddress,
  restoreWorkbenchSnapshot,
  serializeShellPrefs,
  type ShellPrefs,
} from "./prefs";

/** The fixture Dialogue's Workspace: title "myaid", Session "s1". */
const WORKS: WorkspaceProjection = workspaceProjection({
  rows: [workspaceRow({ id: "ws-myaid", path: "/work/myaid", title: "myaid", sessionIds: ["s1"] })],
});

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
      { botId: "bot", workspaceId: "ws-myaid" },
      "dlg",
    ),
    "dlg",
    "s1",
  );
  return renameClaim(created, "dlg", "s1", "First run");
}

function prefsWith(contents: Record<string, unknown>): ShellPrefs {
  return {
    ...emptyShellPrefs(),
    workbench: {
      layout: { center: { type: "tabs", panels: ["p1"], activeIndex: 0 } },
      contents: contents as ShellPrefs["workbench"]["contents"],
      activePanelId: "p1",
    },
  };
}

test("no stored preferences read as the defaults", () => {
  const prefs = parseShellPrefs(null);
  expect(prefs.version).toBe(1);
  expect(prefs.favorites).toEqual([]);
  expect(prefs.workbench.layout.center).toMatchObject({ type: "tabs" });
});

test("preferences round-trip the layout, panel addresses and pins", () => {
  const address = sessionAddress({
    sessionId: "s1",
    label: "First run",
    botId: "bot",
    dialogueId: "dlg",
  });
  const prefs: ShellPrefs = {
    ...prefsWith({ p1: address }),
    nav: { width: 300, open: false, expanded: ["root:bots"] },
    favorites: [address],
  };
  const parsed = parseShellPrefs(serializeShellPrefs(prefs));
  expect(parsed.nav).toEqual({ width: 300, open: false, expanded: ["root:bots"] });
  expect(parsed.favorites[0]?.id).toBe("session:s1");
  expect(parsed.workbench.contents.p1).toMatchObject({
    id: "session:s1",
    kind: "session",
    sessionId: "s1",
  });
});

test("a restored Workbench resolves current titles and empties missing objects", () => {
  const registry = sample();
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
    contents: {
      p1: sessionAddress({
        sessionId: "s1",
        label: "An old title",
        botId: "bot",
        dialogueId: "dlg",
      }),
      p2: botAddress({ id: "gone", name: "Gone" }),
    },
    activePanelId: "p2",
  };
  const restored = restoreWorkbenchSnapshot(stored, (address) =>
    resolveAddress(address, registry, WORKS),
  );
  expect(restored.contents.p1).toMatchObject({
    id: "session:s1",
    title: "First run",
    kind: "session",
  });
  expect(restored.contents.p2).toBe(null);
  expect(restored.activePanelId).toBe("p2");
});

test("an archived Session does not resolve; a renamed Workspace does", () => {
  const registry = sample();
  const dialogue = dialogueAddress({
    id: "dlg",
    title: "myaid",
    botId: "bot",
    botName: "Ada",
    label: "Old name",
  });
  expect(resolveAddress(dialogue, registry, WORKS)?.title).toBe("Ada · myaid");

  // dsh archived the Session: its address comes back as nothing.
  const archived = workspaceProjection({
    rows: [workspaceRow({ id: "ws-myaid", path: "/work/myaid", title: "myaid" })],
    archived: ["s1"],
  });
  expect(
    resolveAddress(
      sessionAddress({ sessionId: "s1", label: "First run", botId: "bot", dialogueId: "dlg" }),
      registry,
      archived,
    ),
  ).toBe(null);

  // A retitled Workspace reads its new name, not the stored label.
  const renamed = workspaceProjection({
    rows: [workspaceRow({ id: "ws-myaid", path: "/work/myaid", title: "release" })],
  });
  expect(resolveAddress(dialogue, registry, renamed)?.title).toBe("Ada · release");
});

test("an invalid layout degrades to one empty panel", () => {
  const prefs = parseShellPrefs(
    JSON.stringify({
      version: 1,
      nav: { width: Number.NaN, open: "yes", expanded: [] },
      favorites: [null, { id: 3 }],
      workbench: {
        layout: { center: { type: "split", axis: "diagonal", children: [] } },
        contents: { p1: null },
        activePanelId: "p1",
      },
    }),
  );
  expect(prefs.nav.width).toBe(232);
  expect(prefs.nav.open).toBe(true);
  expect(prefs.nav.expanded).toEqual([]);
  expect(prefs.favorites).toEqual([]);
  const ids =
    prefs.workbench.layout.center.type === "tabs" ? prefs.workbench.layout.center.panels : [];
  expect(ids).toHaveLength(1);
  expect(prefs.workbench.contents[ids[0]!]).toBe(null);
});
