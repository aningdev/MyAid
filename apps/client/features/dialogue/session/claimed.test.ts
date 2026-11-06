import type { SessionFollowFrame } from "@myaid/dsh-web-protocol/session";
import { expect, test } from "nsh/test";

import {
  claimSession,
  createBot,
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
    initializeBot(
      createBot(
        createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
        { name: "Ada", templateId: "tmpl", workspace: "/work" },
        "bot",
      ),
      "bot",
    ),
    "bot",
    "s1",
  );
}

function fakeTransport(overrides: Partial<SessionTransport> = {}): SessionTransport & {
  prompts: string[];
  followed: string[];
  disposed: boolean;
} {
  const state = {
    prompts: [] as string[],
    followed: [] as string[],
    disposed: false,
    ready: true,
  };
  const transport: SessionTransport & typeof state = {
    ...state,
    createSession: async () => ({ sessionId: "new-session" }),
    listSessions: async () => [{ sessionId: "s1", blank: false, updatedAt: 1 }],
    follow: (sessionId, onFrame) => {
      state.followed.push(sessionId);
      queueMicrotask(() =>
        onFrame({ type: "snapshot", records: [] } as unknown as SessionFollowFrame),
      );
      return () => undefined;
    },
    prompt: async (request) => {
      state.prompts.push(request.text ?? "");
    },
    cancel: async () => undefined,
    withdrawQueuedPrompt: async () => undefined,
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
  const frames: unknown[] = [];
  return {
    connect: async () => transport,
    claim: async (botId, sessionId) => {
      registry = claimSession(registry, botId, sessionId);
      return true;
    },
    registry: () => registry,
    summaries: () => new Map(),
    onFrame: (_sessionId, frame) => {
      frames.push(frame);
    },
    onFollowError: () => undefined,
    ...extras,
  };
}

test("createClaimed creates then claims then follows in order", async () => {
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
      claim: async (botId, sessionId) => {
        order.push(`claim:${botId}:${sessionId}`);
        registry = claimSession(registry, botId, sessionId);
        return true;
      },
    }),
  );
  const bot = registry.bots[0]!;
  const id = await client.createClaimed({
    botId: bot.id,
    bot,
    agentPreset: "standard",
    cwd: "/work",
  });
  expect(id).toBe("created");
  expect(order).toEqual(["create", "claim:bot:created", "follow:created"]);
});

test("occupancy blocks same-workspace prompt", () => {
  const registry = claimSession(readyRegistry(), "bot", "s2");
  const message = occupancyBlock({
    occupyingSessionId: "s1",
    targetSessionId: "s2",
    registry,
    summaries: new Map([["s1", "busy"]]),
  });
  expect(message).toContain("占用");
});

test("prompt refuses when workspace occupied", async () => {
  const registry = claimSession(readyRegistry(), "bot", "s2");
  const transport = fakeTransport();
  const client = new ClaimedSessionClient(hooks(registry, transport));
  await client.ensureConnected();
  client.occupyingSessionId = "s1";
  const bot = registry.bots[0]!;
  await expect(
    client.prompt({ sessionId: "s2", text: "hi", bot, archived: false }),
  ).rejects.toThrow(/占用/);
  expect(transport.prompts).toEqual([]);
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
