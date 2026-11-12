import { expect, test } from "nsh/test";

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
  type ApprovalDecision,
  type ApprovalRequest,
  type ClaimHooks,
  type FlatModelCatalog,
  type SessionTransport,
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
      { botId: "bot", workspacePath: "/work" },
      "dlg",
    ),
    "dlg",
    "s1",
  );
}

function fakeTransport(overrides: Partial<SessionTransport> = {}): SessionTransport & {
  disposed: boolean;
} {
  const state = {
    disposed: false,
    ready: true,
  };
  const transport: SessionTransport & typeof state = {
    ...state,
    createSession: async () => ({ sessionId: "new-session" }),
    listSessions: async () => [{ sessionId: "s1", blank: false, updatedAt: 1, running: false }],
    follow: () => () => undefined,
    sessionPage: async () => ({ records: [], hasMore: false }),
    sessionQueue: async () => [],
    prompt: async () => undefined,
    cancel: async () => undefined,
    withdrawQueuedPrompt: async () => undefined,
    renameSession: async () => undefined,
    uploadFile: async () => ({ receiptId: "receipt" }),
    modelCatalog: async () =>
      ({
        default: { provider: "p", model: "m" },
        models: [{ provider: "p", providerName: "P", model: "m", name: "M" }],
        failures: [],
      }) satisfies FlatModelCatalog,
    selectModel: async () => undefined,
    selectAgentPreset: async () => "standard",
    approvals: (_handler: (request: ApprovalRequest) => Promise<ApprovalDecision>) => undefined,
    dispose: async () => {
      state.disposed = true;
      state.ready = false;
    },
    ...overrides,
  };
  return transport;
}

function hooks(
  registry: BotRegistry,
  transport: SessionTransport,
  extras: Partial<ClaimHooks> = {},
): ClaimHooks {
  return {
    connect: async () => transport,
    claim: async (dialogueId, sessionId) => {
      registry = claimSession(registry, dialogueId, sessionId);
      return true;
    },
    registry: () => registry,
    ...extras,
  };
}

test("createClaimed creates then claims, and leaves following to the Session controller", async () => {
  let registry = readyRegistry();
  const order: string[] = [];
  const transport = fakeTransport({
    createSession: async () => {
      order.push("create");
      return { sessionId: "created" };
    },
    follow: (sessionId) => {
      order.push(`follow:${sessionId}`);
      return () => undefined;
    },
  });
  const client = new ClaimedSessionClient(
    hooks(registry, transport, {
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
  expect(client.getTransport()?.ready).toBe(true);
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

test("dispose drops transport and rejects later use", async () => {
  const registry = readyRegistry();
  const transport = fakeTransport();
  const client = new ClaimedSessionClient(hooks(registry, transport));
  await client.ensureConnected();
  await client.dispose();
  expect(client.disposed).toBe(true);
  expect(client.getTransport()).toBe(undefined);
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
