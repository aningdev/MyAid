import { expect, test } from "nsh/test";

import { emptyRegistry, type BotRegistry } from "../../features/bots/model";
import type { SessionRow } from "../../features/dialogue/session/runtime";
import type { WorkspaceProjection } from "../../features/workspace/state";
import {
  archiveBot,
  claimSegment,
  createBot,
  createTemplate,
  initializeBot,
} from "../../test/bots-fixture";
import { workspaceProjection, workspaceRow } from "../../test/workspaces";
import { botList } from "./botList";

const TMPL = { name: "Coding", presetId: "standard" };

function bots(): BotRegistry {
  const created = createTemplate(emptyRegistry(), TMPL, "tmpl");
  const withAda = createBot(created, { name: "Ada", templateId: "tmpl" }, "ada");
  return createBot(withAda, { name: "Bob", templateId: "tmpl" }, "bob");
}

function row(overrides: Partial<SessionRow> & { id: string; botId: string }): SessionRow {
  return {
    botName: overrides.botId,
    workspacePath: "/work",
    label: overrides.id,
    detail: "",
    updatedAt: null,
    missing: false,
    running: false,
    unread: false,
    attention: false,
    ...overrides,
  };
}

function projection(at: Record<string, string>): WorkspaceProjection {
  return workspaceProjection({
    rows: Object.entries(at).map(([botId, updatedAt]) =>
      workspaceRow({
        id: `ws-${botId}`,
        path: `/work/${botId}`,
        title: botId,
        updatedAt,
      }),
    ),
  });
}

/** Ada and Bob each look at one Workspace; the registry says nothing about pins. */
function registryAt(): BotRegistry {
  const base = bots();
  const ready = initializeBot(initializeBot(base, "ada"), "bob");
  const withAda = claimSegment(ready, "ada", "s-ada", "ws-ada");
  return claimSegment(withAda, "bob", "s-bob", "ws-bob");
}

test("unpinned Bots stay in Registry order, including when one worked later", () => {
  const list = botList({
    registry: registryAt(),
    workspaces: projection({
      ada: "2026-01-01T00:00:00.000Z",
      bob: "2026-02-01T00:00:00.000Z",
    }),
    rows: [],
    pins: [],
  });
  expect(list.others.map((row) => row.bot.name)).toEqual(["Ada", "Bob"]);
  expect(list.pinned).toEqual([]);
  expect(list.archived).toEqual([]);
});

test("a Bot with no activity stays where the Registry put it", () => {
  const created = createTemplate(emptyRegistry(), TMPL, "tmpl");
  const registry = createBot(
    createBot(created, { name: "Zed", templateId: "tmpl" }, "zed"),
    { name: "Amy", templateId: "tmpl" },
    "amy",
  );
  const list = botList({ registry, workspaces: projection({}), rows: [], pins: [] });
  expect(list.others.map((row) => row.bot.name)).toEqual(["Zed", "Amy"]);
});

test("pinned Bots come first in pin order, and leave the rest", () => {
  const list = botList({
    registry: registryAt(),
    workspaces: projection({
      ada: "2026-01-01T00:00:00.000Z",
      bob: "2026-02-01T00:00:00.000Z",
    }),
    rows: [],
    pins: ["ada", "gone"],
  });
  expect(list.pinned.map((row) => row.bot.name)).toEqual(["Ada"]);
  expect(list.pinned[0]?.pinned).toBe(true);
  expect(list.others.map((row) => row.bot.name)).toEqual(["Bob"]);
});

test("a Bot's working, unread and approval marks come from its Sessions", () => {
  const list = botList({
    registry: registryAt(),
    workspaces: projection({
      ada: "2026-01-01T00:00:00.000Z",
      bob: "2026-02-01T00:00:00.000Z",
    }),
    rows: [
      row({ id: "s1", botId: "bob", running: true }),
      row({ id: "s2", botId: "bob", unread: true }),
      row({ id: "s3", botId: "ada", attention: true }),
    ],
    pins: [],
  });
  const bob = list.others.find((row) => row.bot.id === "bob");
  expect(bob?.working).toBe(true);
  expect(bob?.unread).toBe(1);
  expect(bob?.attention).toBe(false);
  const ada = list.others.find((row) => row.bot.id === "ada");
  expect(ada?.attention).toBe(true);
  expect(ada?.working).toBe(false);
});

test("an archived Bot leaves the list, and a search finds it", () => {
  const registry = archiveBot(registryAt(), "ada");
  const quiet = botList({
    registry,
    workspaces: projection({ ada: "2026-01-01T00:00:00.000Z" }),
    rows: [],
    pins: [],
  });
  expect(quiet.others.map((row) => row.bot.name)).toEqual(["Bob"]);
  expect(quiet.archived).toEqual([]);

  const found = botList({
    registry,
    workspaces: projection({ ada: "2026-01-01T00:00:00.000Z" }),
    rows: [],
    pins: [],
    query: "ada",
  });
  expect(found.archived.map((row) => row.bot.name)).toEqual(["Ada"]);
  expect(found.others).toEqual([]);
});

test("a pinned Bot that is archived stays out of the Pin group until it returns", () => {
  const archived = archiveBot(registryAt(), "ada");
  const list = botList({
    registry: archived,
    workspaces: projection({}),
    rows: [],
    pins: ["ada", "bob"],
  });
  expect(list.pinned.map((row) => row.bot.name)).toEqual(["Bob"]);
  const back = botList({
    registry: { ...archived, bots: archived.bots.map((bot) => ({ ...bot, archived: false })) },
    workspaces: projection({}),
    rows: [],
    pins: ["ada", "bob"],
  });
  expect(back.pinned.map((row) => row.bot.name)).toEqual(["Ada", "Bob"]);
});

test("a search matches a Bot's name and its description", () => {
  const withDescription = {
    ...registryAt(),
    bots: registryAt().bots.map((bot) =>
      bot.id === "bob" ? { ...bot, description: "Keeps release notes" } : bot,
    ),
  };
  const list = botList({
    registry: withDescription,
    workspaces: projection({}),
    rows: [],
    pins: [],
    query: "RELEASE",
  });
  expect(list.others.map((row) => row.bot.name)).toEqual(["Bob"]);
});
