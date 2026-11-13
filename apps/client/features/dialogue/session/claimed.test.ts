import { expect, test } from "nsh/test";

import { scriptedHost, scriptedSessions } from "../../../test/sessions";
import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  type BotRegistry,
} from "../../bots/model";
import {
  ClaimedSessionClient,
  occupancyBlock,
  resolveBotModel,
  type ClaimHooks,
  type SessionHost,
  type FlatModelCatalog,
} from "./claimed";

function readyRegistry(): BotRegistry {
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
      { botId: "bot", workspaceId: "ws-work" },
      "dlg",
    ),
    "dlg",
    "s1",
  );
}

function fakeHost(): SessionHost {
  return scriptedHost(scriptedSessions(["s1"]));
}

function hooks(
  registry: BotRegistry,
  host: SessionHost,
  extras: Partial<ClaimHooks> = {},
): ClaimHooks {
  return {
    connect: async () => host,
    claim: async (dialogueId, sessionId) => {
      registry = claimSession(registry, dialogueId, sessionId);
      return true;
    },
    registry: () => registry,
    ...extras,
  };
}

test("createClaimed creates then claims, and leaves the window to the official model", async () => {
  let registry = readyRegistry();
  const order: string[] = [];
  const host = fakeHost();
  host.createSession = async () => {
    order.push("create");
    return { sessionId: "created" };
  };
  const client = new ClaimedSessionClient(
    hooks(registry, host, {
      claim: async (dialogueId, sessionId) => {
        order.push(`claim:${dialogueId}:${sessionId}`);
        registry = claimSession(registry, dialogueId, sessionId);
        return true;
      },
    }),
  );
  const bot = registry.bots[0]!;
  const dialogue = registry.dialogues[0]!;
  const id = await client.createClaimed({
    dialogueId: dialogue.id,
    dialogue,
    bot,
    agentPreset: "standard",
  });
  expect(id).toBe("created");
  expect(order).toEqual(["create", "claim:dlg:created"]);
  expect(client.getHost()?.ready).toBe(true);
});

test("createClaimed asks the session controller for the Dialogue's Workspace", async () => {
  const registry = readyRegistry();
  const requests: { workspaceId?: string; agentPreset?: string; cwd?: string }[] = [];
  const host = fakeHost();
  host.createSession = async (request) => {
    requests.push(request);
    return { sessionId: "created" };
  };
  const client = new ClaimedSessionClient(hooks(registry, host));
  const bot = registry.bots[0]!;
  const dialogue = registry.dialogues[0]!;
  await client.createClaimed({
    dialogueId: dialogue.id,
    dialogue,
    bot,
    agentPreset: "standard",
  });
  // dsh's session.create({ workspaceId }) is the create-then-attach flow: the
  // Workspace records the Session, so the Client passes no cwd of its own.
  expect(requests).toEqual([{ workspaceId: "ws-work", agentPreset: "standard" }]);
});

test("occupancy blocks another running Session in the same workspace", () => {
  const registry = claimSession(readyRegistry(), "dlg", "s2");
  const message = occupancyBlock({
    occupyingSessionIds: ["s1"],
    targetSessionId: "s2",
    registry,
    summaries: new Map([["s1", "busy"]]),
  });
  expect(message).toContain("占用");
  expect(
    occupancyBlock({
      occupyingSessionIds: ["s1"],
      targetSessionId: "s1",
      registry,
      summaries: new Map(),
    }),
  ).toBe(null);
});

test("dispose drops the host and rejects later use", async () => {
  const registry = readyRegistry();
  const host = fakeHost();
  const client = new ClaimedSessionClient(hooks(registry, host));
  await client.ensureConnected();
  await client.dispose();
  expect(client.disposed).toBe(true);
  expect(client.getHost()).toBe(undefined);
  await expect(client.ensureConnected()).rejects.toThrow(/已释放/);
});

test("resolveBotModel matches provider/model and unique name", async () => {
  const catalog: FlatModelCatalog = {
    default: { provider: "p", model: "m" },
    models: [
      { provider: "p", providerName: "P", model: "m", name: "Deep" },
      { provider: "q", providerName: "Q", model: "n", name: "Other" },
    ],
    failures: [],
  };
  expect(await resolveBotModel(catalog, "p/m")).toEqual({ provider: "p", model: "m" });
  expect(await resolveBotModel(catalog, "Deep")).toEqual({ provider: "p", model: "m" });
  expect(await resolveBotModel(catalog, null)).toBe(null);
});
