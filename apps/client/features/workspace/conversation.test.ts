import { expect, test } from "nsh/test";

import { workspaceProjection, workspaceRow } from "../../test/workspaces";
import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  type BotRegistry,
} from "../bots/model";
import { registry } from "../bots/state";
import {
  changeWorkingDirectory,
  newTopic,
  startSegment,
  type SegmentStarter,
} from "./conversation";
import { workspaces } from "./state";

/** Ada, ready, with one segment in /proj-a. */
function seed(): BotRegistry {
  let state = initializeBot(
    createBot(
      createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
      { name: "Ada", templateId: "tmpl", defaultWorkspacePath: "/proj-a" },
      "bot",
    ),
    "bot",
  );
  state = claimSegment(state, "bot", "s1", "ws-a");
  registry.set(state);
  workspaces.set(
    workspaceProjection({
      rows: [
        workspaceRow({ id: "ws-a", path: "/proj-a", sessionIds: ["s1"] }),
        workspaceRow({ id: "ws-b", path: "/proj-b", sessionIds: [] }),
      ],
    }),
  );
  return state;
}

/** A start whose Workspace already exists, and whose claim appends a segment. */
function starter(
  calls: string[],
  options: { workspaceId: string; sessionId: string; picked?: string | null } = {
    workspaceId: "ws-b",
    sessionId: "s2",
  },
): SegmentStarter {
  return {
    async workspace(path) {
      calls.push(`workspace:${path}`);
      return { id: options.workspaceId };
    },
    async createSession(botId, workspaceId) {
      calls.push(`create:${botId}:${workspaceId}`);
      registry.set(claimSegment(registry(), botId, options.sessionId, workspaceId));
      return options.sessionId;
    },
    async rememberPath(botId, path) {
      calls.push(`remember:${botId}:${path}`);
    },
    async pickDirectory() {
      calls.push("pick");
      return options.picked ?? null;
    },
  };
}

test("「新话题」 starts the next segment in the current working directory", async () => {
  seed();
  const calls: string[] = [];
  const id = await newTopic("bot", starter(calls, { workspaceId: "ws-a", sessionId: "s2" }));
  expect(id).toBe("s2");
  expect(calls).toEqual(["workspace:/proj-a", "create:bot:ws-a", "remember:bot:/proj-a"]);
  expect(registry().bots[0]?.segments.map((segment) => segment.sessionId)).toEqual(["s1", "s2"]);
  expect(registry().bots[0]?.segments[1]?.workspaceId).toBe("ws-a");
});

test("a different working directory starts a new segment there; the same one does not", async () => {
  seed();
  const calls: string[] = [];
  const same = await changeWorkingDirectory("bot", "/proj-a", starter(calls));
  expect(same).toBe(null);
  expect(calls).toEqual([]);

  const next = await changeWorkingDirectory("bot", "/proj-b/", starter(calls));
  expect(next).toBe("s2");
  expect(calls[0]).toBe("workspace:/proj-b/");
  expect(registry().bots[0]?.segments.map((segment) => segment.workspaceId)).toEqual([
    "ws-a",
    "ws-b",
  ]);
});

test("a Bot with no directory asks for one, and starts nothing when the picker is cancelled", async () => {
  registry.set(
    initializeBot(
      createBot(
        createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
        { name: "Ada", templateId: "tmpl" },
        "bot",
      ),
      "bot",
    ),
  );
  workspaces.set(workspaceProjection());
  const calls: string[] = [];
  expect(
    await startSegment(
      "bot",
      undefined,
      starter(calls, { picked: null, workspaceId: "ws-a", sessionId: "s1" }),
    ),
  ).toBe(null);
  expect(calls).toEqual(["pick"]);
  expect(registry().bots[0]?.segments).toHaveLength(0);

  const id = await startSegment(
    "bot",
    undefined,
    starter(calls, { picked: "/picked", workspaceId: "ws-a", sessionId: "s1" }),
  );
  expect(id).toBe("s1");
  expect(calls).toContain("workspace:/picked");
});

test("a draft Bot cannot start a segment", async () => {
  registry.set(
    createBot(
      createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
      { name: "Ada", templateId: "tmpl" },
      "bot",
    ),
  );
  const calls: string[] = [];
  expect(await startSegment("bot", "/proj-a", starter(calls))).toBe(null);
  expect(calls).toEqual([]);
});
