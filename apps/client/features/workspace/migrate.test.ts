import { expect, test } from "nsh/test";

import type { Bot, LegacyRegistry } from "../bots/model";
import { defaultWorkspaceTitle, migrateRegistry, type WorkspaceBridge } from "./migrate";

function bot(overrides: Partial<Bot> = {}): Bot {
  return {
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
    identity: { color: "rose", shape: "round", face: "calm" },
    segments: [],
    ...overrides,
  };
}

/** A v4 file: two Dialogues, one with a name, one archived claim, one pin. */
function legacy(): LegacyRegistry {
  return {
    version: 4,
    templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
    bots: [bot()],
    dialogues: [
      {
        id: "dlg",
        botId: "bot",
        workspacePath: "/work/dsh-bot",
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

/** A v5 file: Ada's two Dialogues over two directories, three Sessions in all. */
function v5(): LegacyRegistry {
  return {
    version: 5,
    templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
    bots: [bot({ hadDialogue: true })],
    dialogues: [
      {
        id: "dlg-a",
        botId: "bot",
        workspaceId: "ws-a",
        claims: [
          { sessionId: "s1", title: "First run" },
          { sessionId: "s2", title: null },
        ],
      },
      {
        id: "dlg-b",
        botId: "bot",
        workspaceId: "ws-b",
        claims: [{ sessionId: "s3", title: "Another directory" }],
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
    async unarchiveSession(sessionId: string) {
      calls.push(`unarchive:${sessionId}`);
      archivedNow.delete(sessionId);
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

test("a v4 Dialogue becomes segments over the Workspace dsh creates", async () => {
  const dsh = bridge();
  const { registry, report } = await migrateRegistry(legacy(), dsh);
  expect(dsh.calls).toContain("create:/work/dsh-bot");
  expect(registry.version).toBe(6);
  expect(registry.bots[0]?.segments).toEqual([
    { sessionId: "s1", workspaceId: "ws:/work/dsh-bot", title: "First run" },
    { sessionId: "s2", workspaceId: "ws:/work/dsh-bot", title: null },
  ]);
  expect(report).toMatchObject({ dialogues: 1, workspaces: 1, unarchived: 0 });
});

test("two v5 Dialogues merge into one long conversation, ordered by claim", async () => {
  const dsh = bridge();
  const { registry, report } = await migrateRegistry(v5(), dsh);
  // Each segment keeps the Workspace it ran in.
  expect(registry.bots[0]?.segments).toEqual([
    { sessionId: "s1", workspaceId: "ws-a", title: "First run" },
    { sessionId: "s2", workspaceId: "ws-a", title: null },
    { sessionId: "s3", workspaceId: "ws-b", title: "Another directory" },
  ]);
  expect(report.dialogues).toBe(2);
  // The v5 Workspaces already exist: the migration creates none.
  expect(dsh.calls.filter((call) => call.startsWith("create:"))).toEqual([]);
});

test("an archived Session comes back as a segment, so the history is complete", async () => {
  const dsh = bridge();
  dsh.archivedNow.add("s2");
  const { registry, report } = await migrateRegistry(v5(), dsh);
  expect(dsh.calls).toContain("unarchive:s2");
  expect(report.unarchived).toBe(1);
  expect(registry.bots[0]?.segments.map((segment) => segment.sessionId)).toEqual([
    "s1",
    "s2",
    "s3",
  ]);
  // Only the archived one was touched.
  expect(dsh.calls).not.toContain("unarchive:s1");
});

test("a v4 name moves to the title only while dsh still has the default one", async () => {
  const dsh = bridge();
  await migrateRegistry(legacy(), dsh);
  expect(dsh.calls).toContain("rename:ws:/work/dsh-bot:Release notes");

  // The Workspace was already renamed by a person: the old name does not win.
  const renamed = bridge({ title: "release" });
  await migrateRegistry(legacy(), renamed);
  expect(renamed.titles).toEqual([]);
});

test("two Dialogues on one Workspace move one name and create one Workspace", async () => {
  const source = legacy();
  source.dialogues.push({
    ...(source.dialogues[0] as Extract<
      LegacyRegistry["dialogues"][number],
      { workspacePath: string }
    >),
    id: "dlg2",
    claims: [{ sessionId: "s3", title: null, archived: false }],
    name: "Another name",
  });
  const dsh = bridge();
  const { registry, report } = await migrateRegistry(source, dsh);
  expect(dsh.calls.filter((call) => call.startsWith("create:"))).toHaveLength(2);
  expect(dsh.calls.filter((call) => call.startsWith("rename:"))).toHaveLength(1);
  expect(registry.bots[0]?.segments.map((segment) => segment.workspaceId)).toEqual([
    "ws:/work/dsh-bot",
    "ws:/work/dsh-bot",
    "ws:/work/dsh-bot",
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
  dsh.archivedNow.add("s2");
  const first = await migrateRegistry(v5(), dsh);
  const second = await migrateRegistry(v5(), dsh);
  expect(second.registry).toEqual(first.registry);
  // Once unarchived, a retry does not ask again.
  expect(dsh.calls.filter((call) => call === "unarchive:s2")).toHaveLength(1);
});

test("a name dsh refuses, or a Session it no longer knows, is skipped not fatal", async () => {
  const dsh = bridge({
    async rename() {
      throw new Error("workspace/name-conflict: Workspace name is already in use");
    },
    async unarchiveSession() {
      throw new Error("session/not-found: unknown Session");
    },
    async pinSession() {
      throw new Error("session/not-found: unknown Session");
    },
  });
  dsh.archivedNow.add("s2");
  const { registry, report } = await migrateRegistry(legacy(), dsh, ["s1"]);
  // Every segment still lands; the refused parts stay as dsh has them.
  expect(registry.bots[0]?.segments.map((segment) => segment.sessionId)).toEqual(["s1", "s2"]);
  expect(report).toMatchObject({ renamed: 0, unarchived: 0, pinned: 0, skipped: 3 });
});

test("the default title is the last path segment, root spellings included", () => {
  expect(defaultWorkspaceTitle("/work/dsh-bot")).toBe("dsh-bot");
  expect(defaultWorkspaceTitle("/work/dsh-bot/")).toBe("dsh-bot");
  expect(defaultWorkspaceTitle("/")).toBe("/");
});
