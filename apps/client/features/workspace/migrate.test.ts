import { expect, test } from "nsh/test";

import type { LegacyRegistry } from "../bots/model";
import { defaultWorkspaceTitle, migrateRegistry, type WorkspaceBridge } from "./migrate";

/** A v4 file: two Dialogues, one with a name, one archived claim, one pin. */
function legacy(): LegacyRegistry {
  return {
    templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
    bots: [
      {
        id: "bot",
        name: "Ada",
        description: null,
        templateId: "tmpl",
        defaultModel: null,
        defaultThinking: null,
        defaultWorkspacePath: null,
        hadDialogue: true,
        status: "ready",
        boundPresetId: "standard",
        derivedPresetId: null,
        archived: false,
        identity: { color: "rose", glyph: "orbit" },
      },
    ],
    dialogues: [
      {
        id: "dlg",
        botId: "bot",
        workspacePath: "/work/myaid",
        name: "Release notes",
        archived: false,
        claims: [
          { sessionId: "s1", title: "First run", archived: false },
          { sessionId: "s2", title: null, archived: true },
        ],
      },
    ],
  };
}

/** A dsh double that records what the migration asked of it. */
function bridge(
  overrides: Partial<WorkspaceBridge> & { title?: string } = {},
): WorkspaceBridge & { calls: string[]; titles: string[]; archivedNow: Set<string> } {
  const calls: string[] = [];
  const titles: string[] = [];
  const archivedNow = new Set<string>();
  const state = {
    archivedNow,
    titles,
    calls,
    async create(path: string) {
      calls.push(`create:${path}`);
      return { workspaceId: `ws:${path}`, title: overrides.title ?? defaultWorkspaceTitle(path) };
    },
    async rename(workspaceId: string, title: string) {
      calls.push(`rename:${workspaceId}:${title}`);
      titles.push(title);
    },
    async archiveSession(sessionId: string) {
      calls.push(`archive:${sessionId}`);
      archivedNow.add(sessionId);
    },
    async pinSession(sessionId: string) {
      calls.push(`pin:${sessionId}`);
    },
    archived: () => archivedNow as ReadonlySet<string>,
    pinned: () => [] as readonly string[],
    async ready() {
      calls.push("ready");
    },
    ...overrides,
  };
  return state as WorkspaceBridge & {
    calls: string[];
    titles: string[];
    archivedNow: Set<string>;
  };
}

test("a v4 Dialogue becomes a v5 Dialogue over the Workspace dsh creates", async () => {
  const dsh = bridge();
  const { registry, report } = await migrateRegistry(legacy(), dsh);
  expect(dsh.calls).toContain("create:/work/myaid");
  expect(registry.version).toBe(5);
  expect(registry.dialogues[0]).toEqual({
    id: "dlg",
    botId: "bot",
    workspaceId: "ws:/work/myaid",
    claims: [
      { sessionId: "s1", title: "First run" },
      { sessionId: "s2", title: null },
    ],
  });
  expect(report).toMatchObject({ dialogues: 1, workspaces: 1, archived: 1 });
});

test("a v4 name moves to the title only while dsh still has the default one", async () => {
  const dsh = bridge();
  await migrateRegistry(legacy(), dsh);
  expect(dsh.calls).toContain("rename:ws:/work/myaid:Release notes");

  // The Workspace was already renamed by a person: the old name does not win.
  const renamed = bridge({ title: "release" });
  await migrateRegistry(legacy(), renamed);
  expect(renamed.titles).toEqual([]);
});

test("two Dialogues on one Workspace move one name and create one Workspace", async () => {
  const source = legacy();
  source.dialogues.push({
    ...source.dialogues[0]!,
    id: "dlg2",
    name: "Another name",
  });
  const dsh = bridge();
  const { registry, report } = await migrateRegistry(source, dsh);
  expect(dsh.calls.filter((call) => call.startsWith("create:"))).toHaveLength(2);
  expect(dsh.calls.filter((call) => call.startsWith("rename:"))).toHaveLength(1);
  expect(registry.dialogues.map((item) => item.workspaceId)).toEqual([
    "ws:/work/myaid",
    "ws:/work/myaid",
  ]);
  // The second Dialogue's name cannot be the shared title: it is reported.
  expect(report.renamed).toBe(1);
  expect(report.skipped).toBe(1);
});

test("a Workspace already retitled in dsh keeps it, and the old name is reported", async () => {
  const dsh = bridge({ title: "release" });
  const { report } = await migrateRegistry(legacy(), dsh);
  expect(dsh.titles).toEqual([]);
  expect(report.renamed).toBe(0);
  expect(report.skipped).toBe(1);
});

test("archived claims become dsh archive entries; an already archived id is skipped", async () => {
  const dsh = bridge();
  dsh.archivedNow.add("s2");
  const { report } = await migrateRegistry(legacy(), dsh);
  expect(dsh.calls).not.toContain("archive:s2");
  expect(report.archived).toBe(0);
});

test("session pins read from prefs become dsh pins", async () => {
  const dsh = bridge();
  const { report } = await migrateRegistry(legacy(), dsh, ["s1", "s9"]);
  expect(dsh.calls).toContain("pin:s1");
  expect(dsh.calls).toContain("pin:s9");
  expect(report.pinned).toBe(2);
});

test("the migration waits for the follow baseline and asks dsh each time", async () => {
  const dsh = bridge();
  const { calls, ...rest } = dsh;
  await migrateRegistry(legacy(), {
    ...rest,
    ready: async () => {
      calls.push("ready");
    },
  });
  expect(calls[0]).toBe("ready");
});

test("an interrupted migration is safe to run again: dsh returns the same Workspace", async () => {
  const dsh = bridge();
  const first = await migrateRegistry(legacy(), dsh);
  const second = await migrateRegistry(legacy(), dsh);
  expect(second.registry).toEqual(first.registry);
  // The already archived claim is not archived twice.
  expect(dsh.calls.filter((call) => call === "archive:s2")).toHaveLength(1);
});

test("a name dsh refuses, or a Session it no longer knows, is skipped not fatal", async () => {
  const dsh = bridge({
    async rename() {
      throw new Error("workspace/name-conflict: Workspace name is already in use");
    },
    async archiveSession() {
      throw new Error("session/not-found: unknown Session");
    },
    async pinSession() {
      throw new Error("session/not-found: unknown Session");
    },
  });
  const { registry, report } = await migrateRegistry(legacy(), dsh, ["s1"]);
  // The Dialogue still gets its Workspace id; the refused parts stay as dsh has them.
  expect(registry.dialogues[0]?.workspaceId).toBe("ws:/work/myaid");
  expect(report).toMatchObject({ renamed: 0, archived: 0, pinned: 0, skipped: 3 });
});

test("the default title is the last path segment, root spellings included", () => {
  expect(defaultWorkspaceTitle("/work/myaid")).toBe("myaid");
  expect(defaultWorkspaceTitle("/work/myaid/")).toBe("myaid");
  expect(defaultWorkspaceTitle("/")).toBe("/");
});
