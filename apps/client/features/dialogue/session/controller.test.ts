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
    sessionPage: async () => ({ records: [], hasMore: false }),
    sessionQueue: async () => [],
    renameSession: async () => undefined,
    uploadFile: async () => ({ receiptId: "receipt" }),
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

test("the draft and its files stay with the Session while Panels come and go", () => {
  const { controllers } = setup();
  const controller = controllers.controllerFor("s1");
  controller.mount();
  controller.setDraft("half a thought");
  controller.attachFile(new Blob([new Uint8Array(2048)], { type: "image/png" }));
  const [attachment] = controller.draftAttachments();
  expect(attachment.mediaType).toBe("image/png");
  expect(attachment.size).toBe("2 KB");

  // A Panel leaves and comes back: the controller keeps what was typed.
  controller.unmount();
  expect(controllers.controllerFor("s1").draft()).toBe("half a thought");
  expect(controllers.controllerFor("s1").draftAttachments().length).toBe(1);

  controllers.controllerFor("s1").detachFile(attachment.id);
  expect(controllers.controllerFor("s1").draftAttachments().length).toBe(0);
  controllers.controllerFor("s1").clearDraft();
  expect(controllers.controllerFor("s1").draft()).toBe("");
});

test("a prompt sent while the turn runs queues in dsh, and can be withdrawn", async () => {
  const { transport, controllers } = setup();
  const controller = controllers.controllerFor("s1");
  controller.mount();
  await settled();
  transport.push("s1", snapshot());
  transport.push("s1", turnStart(1));
  expect(controller.running()).toBe(true);

  const items: { id: string; requestId?: string; text: string }[] = [];
  transport.sessionQueue = async () => items;
  transport.prompt = async (request) => {
    items.push({ id: "item-1", requestId: request.requestId, text: request.text ?? "" });
  };
  await controller.queuePrompt("and one more");
  expect(controller.queued().map((item) => item.text)).toEqual(["and one more"]);

  await controller.refreshQueue();
  expect(controller.queued()[0]).toMatchObject({ itemId: "item-1", text: "and one more" });

  const withdrawn: string[] = [];
  transport.withdrawQueuedPrompt = async (_sessionId, itemId) => {
    withdrawn.push(itemId);
  };
  const requestId = controller.queued()[0].requestId;
  items.length = 0;
  await controller.withdrawQueued(requestId);
  expect(withdrawn).toEqual(["item-1"]);
  expect(controller.queued().length).toBe(0);
});

test("older history is read from the page before the follow window", async () => {
  const { transport, controllers } = setup();
  const controller = controllers.controllerFor("s1");
  controller.mount();
  await settled();
  transport.push(
    "s1",
    frame({
      type: "snapshot",
      hasMore: true,
      records: [
        { type: "event", event: { seq: 10, type: "user/message", data: { content: "newer" } } },
      ],
    }),
  );
  expect(controller.view().olderHasMore).toBe(true);

  const asked: number[] = [];
  transport.sessionPage = async (request) => {
    asked.push(request.beforeSeq);
    return {
      records: [
        { type: "event", event: { seq: 3, type: "user/message", data: { content: "older" } } },
      ],
      hasMore: false,
    };
  };
  await controller.loadOlder();
  expect(asked).toEqual([10]);
  expect(
    controller.view().messages.map((message) => message.kind === "user" && message.text),
  ).toEqual(["older", "newer"]);
  expect(controller.view().olderHasMore).toBe(false);
  expect(controller.olderLoading()).toBe(false);
});
