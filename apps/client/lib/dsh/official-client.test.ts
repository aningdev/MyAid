/**
 * The official React-free Client models ship as browser `__ModuleLoader__`
 * bundles; NSH runs no code from strings, so `prepare:sdk` unwraps their
 * factory into static ESM. This proves the unwrapped code is the real official
 * code and behaves inside NSH's runtime — no Host, no product UI.
 */
import { expect, test } from "nsh/test";

import { officialSessionClient, officialWorkspaceClient } from "./sdk.js";

/** The official models' own values, off the unwrapped bundle's default export. */
type OfficialValues = {
  MutableSessionEventSource: new () => {
    getSnapshot(): {
      entries: readonly unknown[];
      hasMore: boolean;
      revision: number;
      change: { kind: string };
    };
    replace(entries: readonly unknown[], hasMore: boolean): void;
    prepend(entries: readonly unknown[], hasMore: boolean): void;
    append(entry: unknown): void;
  };
  ClientWorkspaceModel: new (remote: never) => {
    getSnapshot(): {
      items: readonly { title: string; sessionIds: readonly unknown[] }[];
      archivedSessionIds: readonly unknown[];
      phase: string;
    };
    replaceBaseline(baseline: unknown): void;
    upsertView(view: unknown): void;
  };
};
const sessionValues = officialSessionClient as unknown as OfficialValues;
const workspaceValues = officialWorkspaceClient as unknown as OfficialValues;

function entry(seq: number) {
  return {
    type: "event" as const,
    event: { seq, type: "turn/start" as const, time: seq, data: {} },
  } as never;
}

test("official Session event window replaces, appends and settles", () => {
  const source = new sessionValues.MutableSessionEventSource();
  expect(source.getSnapshot().revision).toBe(0);
  source.replace([entry(1), entry(2)], true);
  const opened = source.getSnapshot();
  expect(opened.entries.length).toBe(2);
  expect(opened.hasMore).toBe(true);
  expect(opened.change.kind).toBe("replace");
  source.append(entry(3));
  expect(source.getSnapshot().entries.length).toBe(3);
  expect(source.getSnapshot().revision).toBeGreaterThan(opened.revision);
  source.prepend([entry(0)], false);
  expect(source.getSnapshot().entries.length).toBe(4);
  expect(source.getSnapshot().hasMore).toBe(false);
});

test("official Workspace model owns the row, archive and pin projection", () => {
  const model = new workspaceValues.ClientWorkspaceModel({} as never);
  expect(model.getSnapshot().phase).toBe("pending");
  model.replaceBaseline({
    items: [
      {
        workspaceId: "w1",
        path: "/tmp/w1",
        title: "one",
        sessionIds: ["s1"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ] as never,
    archivedSessionIds: ["s1"],
    pinnedSessionIds: [],
  } as never);
  const opened = model.getSnapshot();
  expect(opened.phase).toBe("ready");
  expect(opened.items.length).toBe(1);
  expect(opened.archivedSessionIds).toEqual(["s1"]);
  model.upsertView({
    workspaceId: "w1",
    path: "/tmp/w1",
    title: "renamed",
    sessionIds: ["s1", "s2"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
  } as never);
  expect(model.getSnapshot().items[0]?.title).toBe("renamed");
  expect(model.getSnapshot().items[0]?.sessionIds.length).toBe(2);
});
