import type { SessionFollowFrame } from "@myaid/dsh-web-protocol/session";
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
  type ApprovalDecision,
  type ApprovalRequest,
  type FlatModelCatalog,
  type SessionTransport,
} from "./claimed";
import { SessionRegistry } from "./controller";

function readyRegistry(): BotRegistry {
  return claimSession(
    claimSession(
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
    ),
    "dlg",
    "s2",
  );
}

type Stream = { closed: boolean; onFrame: (frame: SessionFollowFrame) => void };

function fakeTransport(): SessionTransport & {
  streams: Map<string, Stream[]>;
  prompts: string[];
  push(sessionId: string, frame: unknown): void;
  closed(sessionId: string): number;
} {
  const streams = new Map<string, Stream[]>();
  const prompts: string[] = [];
  const transport: SessionTransport & {
    streams: Map<string, Stream[]>;
    prompts: string[];
    push(sessionId: string, frame: unknown): void;
    closed(sessionId: string): number;
  } = {
    ready: true,
    streams,
    prompts,
    createSession: async () => ({ sessionId: "new-session" }),
    listSessions: async () => [],
    follow: (sessionId, onFrame) => {
      const stream: Stream = { closed: false, onFrame };
      streams.set(sessionId, [...(streams.get(sessionId) ?? []), stream]);
      return () => {
        stream.closed = true;
      };
    },
    prompt: async (request) => {
      prompts.push(request.text ?? "");
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
    dispose: async () => undefined,
    push(sessionId, frame) {
      for (const stream of streams.get(sessionId) ?? []) {
        if (!stream.closed) stream.onFrame(frame as SessionFollowFrame);
      }
    },
    closed(sessionId) {
      return (streams.get(sessionId) ?? []).filter((stream) => stream.closed).length;
    },
  };
  return transport;
}

function setup(registry: BotRegistry = readyRegistry()) {
  const transport = fakeTransport();
  let changes = 0;
  const controllers = new SessionRegistry({
    ensureTransport: async () => transport,
    transport: () => transport,
    registry: () => registry,
    summaries: () => new Map(),
    onChange: () => {
      changes += 1;
    },
  });
  return { transport, controllers, changes: () => changes };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function frame(value: unknown): SessionFollowFrame {
  return value as SessionFollowFrame;
}

function snapshot(records: unknown[] = []): SessionFollowFrame {
  return frame({ type: "snapshot", records });
}

function turnStart(seq: number): SessionFollowFrame {
  return frame({ type: "event", event: { seq, type: "turn/start", data: {} } });
}

function turnEnd(seq: number): SessionFollowFrame {
  return frame({
    type: "event",
    event: { seq, type: "turn/end", data: { reason: { kind: "completed" } } },
  });
}

function userMessage(seq: number, text: string): SessionFollowFrame {
  return frame({
    type: "event",
    event: {
      seq,
      type: "user/message",
      data: { content: text, source: { kind: "user" } },
    },
  });
}

function chunk(text: string): SessionFollowFrame {
  return frame({
    type: "assistant-stream",
    frame: { type: "chunk", chunk: { type: "text-delta", text } },
  });
}

test("two Sessions stream concurrently into separate views", async () => {
  const { transport, controllers } = setup();
  const a = controllers.controllerFor("s1");
  const b = controllers.controllerFor("s2");
  a.mount();
  b.mount();
  await settled();

  transport.push("s1", snapshot());
  transport.push("s2", snapshot());
  transport.push("s1", userMessage(1, "alpha"));
  transport.push("s2", userMessage(1, "beta"));
  transport.push("s1", turnStart(2));
  transport.push("s2", turnStart(2));
  transport.push("s1", chunk("one "));
  transport.push("s2", chunk("two "));
  transport.push("s1", chunk("stream"));
  transport.push("s2", chunk("stream"));

  expect(a.view().liveMd).toBe("one stream");
  expect(b.view().liveMd).toBe("two stream");
  expect(a.view().messages.map((message) => message.kind)).toEqual(["user"]);
  expect(b.view().messages[0]).toMatchObject({ kind: "user", text: "beta" });
  expect(a.running()).toBe(true);
  expect(b.running()).toBe(true);
});

test("an approval reaches only its own Session", async () => {
  const { controllers } = setup();
  const a = controllers.controllerFor("s1");
  const b = controllers.controllerFor("s2");
  a.mount();
  b.mount();

  const decided = a.requestApproval({
    sessionId: "s1",
    toolName: "Bash",
    reason: "run a command",
    details: "{}",
  });
  expect(a.pendingApproval()?.toolName).toBe("Bash");
  expect(b.pendingApproval()).toBe(null);
  expect(controllers.statusOf("s1").attention).toBe(true);
  expect(controllers.statusOf("s2").attention).toBe(false);

  a.answerApproval("allowed-once");
  expect(await decided).toBe("allowed-once");
  expect(a.pendingApproval()).toBe(null);
  expect(controllers.statusOf("s1").attention).toBe(false);
});

test("an idle controller leaves when its Panel closes; a running one stays to finish", async () => {
  const { transport, controllers } = setup();
  const idle = controllers.controllerFor("s1");
  idle.mount();
  await settled();
  idle.unmount();
  expect(idle.isDisposed).toBe(true);
  expect(controllers.peek("s1")).toBeUndefined();

  const running = controllers.controllerFor("s1");
  running.mount();
  await settled();
  transport.push("s1", snapshot());
  transport.push("s1", turnStart(1));
  running.unmount();
  expect(running.isDisposed).toBe(false);
  expect(controllers.peek("s1")).toBe(running);

  transport.push("s1", turnEnd(2));
  expect(running.isDisposed).toBe(true);
  expect(transport.closed("s1")).toBeGreaterThan(0);
});

test("a reply that finishes off-screen is unread until a Panel shows it", async () => {
  const { transport, controllers } = setup();
  const controller = controllers.controllerFor("s1");
  controller.mount();
  await settled();
  transport.push("s1", snapshot());
  transport.push("s1", turnStart(1));
  controller.unmount();
  expect(controllers.statusOf("s1").running).toBe(true);

  transport.push("s1", turnEnd(2));
  expect(controllers.statusOf("s1")).toEqual({
    running: false,
    unread: true,
    attention: false,
  });

  const again = controllers.controllerFor("s1");
  again.mount();
  expect(controllers.statusOf("s1").unread).toBe(false);
});

test("a prompt is refused while another Session runs in the same workspace", async () => {
  const { transport, controllers } = setup();
  const running = controllers.controllerFor("s1");
  running.mount();
  await settled();
  transport.push("s1", snapshot());
  transport.push("s1", turnStart(1));
  expect(running.running()).toBe(true);

  const waiting = controllers.controllerFor("s2");
  await expect(waiting.prompt("hi")).rejects.toThrow(/占用/);
  expect(transport.prompts).toEqual([]);
});

test("prompt sends through the transport and starts following", async () => {
  const { transport, controllers } = setup();
  const controller = controllers.controllerFor("s1");
  const requestId = await controller.prompt("hello");
  expect(requestId.length).toBeGreaterThan(0);
  expect(transport.prompts).toEqual(["hello"]);
  expect(transport.closed("s1")).toBe(0);
});

test("two Panels on one Session share its controller and draft", () => {
  const { controllers } = setup();
  const first = controllers.controllerFor("s1");
  const second = controllers.controllerFor("s1");
  expect(second).toBe(first);
  first.draft.set("half written");
  expect(second.draft()).toBe("half written");
});

test("connection loss marks the error, and reconnect re-follows a shown Session", async () => {
  const { transport, controllers } = setup();
  const controller = controllers.controllerFor("s1");
  controller.mount();
  await settled();
  transport.push("s1", snapshot());
  transport.push("s1", turnStart(1));
  expect(transport.closed("s1")).toBe(0);

  controllers.connectionLost();
  expect(controller.error()).toContain("断开");
  expect(controller.running()).toBe(false);
  expect(transport.closed("s1")).toBe(1);

  controllers.connectionRestored();
  await settled();
  expect(controller.error()).toBe(null);
  expect(transport.closed("s1")).toBe(1);
  expect((transport.streams.get("s1") ?? []).length).toBe(2);
});
