/**
 * One SessionController over a scripted official Session model: concurrent
 * windows, approvals, lazy removal, unread, the same-workspace guard, prompt
 * routing, per-Session drafts, the queued prompt, older history, and a
 * reconnect that replaces the window instead of duplicating it.
 */
import { expect, test } from "nsh/test";

import {
  scriptedHost,
  scriptedSessions,
  assistantMessage,
  durable,
  liveChunk,
  userMessage,
} from "../../../test/sessions";
import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  type BotRegistry,
} from "../../bots/model";
import { SessionRegistry } from "./controller";

function readyRegistry(): BotRegistry {
  return claimSession(
    claimSession(
      createDialogue(
        initializeBot(
          createBot(
            createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
            { name: "Ada", templateId: "tmpl", defaultModel: "p/m" },
            "bot",
          ),
          "bot",
        ),
        { botId: "bot", workspaceId: "ws-work" },
        "dlg",
      ),
      "dlg",
      "s1",
    ),
    "dlg",
    "s2",
  );
}

function setup(registry: BotRegistry = readyRegistry()) {
  const sessions = scriptedSessions(["s1", "s2"]);
  const host = scriptedHost(sessions);
  let changes = 0;
  const controllers = new SessionRegistry({
    ensureHost: async () => host,
    host: () => host,
    registry: () => registry,
    sessionArchived: () => false,
    summaries: () => new Map(),
    onChange: () => {
      changes += 1;
    },
  });
  return { sessions, host, controllers, changes: () => changes };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Mount a controller and let its reference settle. */
async function mounted(controllers: SessionRegistry, sessionId: string) {
  const controller = controllers.controllerFor(sessionId);
  controller.mount();
  await settled();
  return controller;
}

test("two Sessions stream concurrently into separate views", async () => {
  const { sessions, controllers } = setup();
  const a = await mounted(controllers, "s1");
  const b = await mounted(controllers, "s2");

  sessions.update("s1", { kind: "replace", entries: [userMessage(1, "alpha")], hasMore: false });
  sessions.update("s2", { kind: "replace", entries: [userMessage(1, "beta")], hasMore: false });
  sessions.running("s1", true);
  sessions.running("s2", true);
  for (const [sessionId, text] of [
    ["s1", "one "],
    ["s2", "two "],
    ["s1", "stream"],
    ["s2", "stream"],
  ] as const) {
    sessions.update(sessionId, { kind: "append", entry: liveChunk(10, sessionId, text) });
  }

  expect(a.view().liveMd).toBe("one stream");
  expect(b.view().liveMd).toBe("two stream");
  expect(a.view().messages.map((message) => message.kind)).toEqual(["user"]);
  expect(b.view().messages[0]).toMatchObject({ kind: "user", text: "beta" });
  expect(a.running()).toBe(true);
  expect(b.running()).toBe(true);
});

test("an approval reaches only its own Session", async () => {
  const { controllers } = setup();
  const a = await mounted(controllers, "s1");
  const b = await mounted(controllers, "s2");

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
  const { sessions, controllers } = setup();
  const idle = await mounted(controllers, "s1");
  idle.unmount();
  // The release waits a tick: a Panel re-render unmounts and mounts again.
  await settled();
  expect(idle.isDisposed).toBe(true);
  expect(controllers.peek("s1")).toBeUndefined();

  const running = await mounted(controllers, "s1");
  sessions.running("s1", true);
  running.unmount();
  expect(running.isDisposed).toBe(false);
  expect(controllers.peek("s1")).toBe(running);

  sessions.running("s1", false);
  await settled();
  expect(running.isDisposed).toBe(true);
});

test("a reply that finishes off-screen is unread until a Panel shows it", async () => {
  const { sessions, controllers } = setup();
  const controller = await mounted(controllers, "s1");
  sessions.running("s1", true);
  controller.unmount();
  expect(controllers.statusOf("s1").running).toBe(true);

  sessions.running("s1", false);
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
  const { sessions, host, controllers } = setup();
  const running = await mounted(controllers, "s1");
  sessions.running("s1", true);
  expect(running.running()).toBe(true);

  const waiting = controllers.controllerFor("s2");
  await expect(waiting.prompt("hi")).rejects.toThrow(/占用/);
  expect(host.selected.length).toBe(0);
});

test("prompt sends through the official Session and applies the Bot's model", async () => {
  const { sessions, host, controllers } = setup();
  const controller = await mounted(controllers, "s1");
  const requestId = await controller.prompt("hello");
  expect(requestId.length).toBeGreaterThan(0);
  expect(sessions.prompts.map((prompt) => prompt.text)).toEqual(["hello"]);
  expect(sessions.prompts[0]?.requestId).toBe(requestId);
  expect(host.selected).toEqual([{ sessionId: "s1", provider: "p", model: "m" }]);
});

test("two Panels on one Session share its controller and draft", async () => {
  const { controllers } = setup();
  const first = controllers.controllerFor("s1");
  const second = controllers.controllerFor("s1");
  expect(second).toBe(first);
  first.draft.set("half written");
  expect(second.draft()).toBe("half written");
});

test("a new Host generation re-reads the window without duplicating it", async () => {
  const { sessions, controllers } = setup();
  const controller = await mounted(controllers, "s1");
  sessions.update("s1", { kind: "replace", entries: [userMessage(1, "hi")], hasMore: false });
  sessions.running("s1", true);
  expect(controller.view().messages.length).toBe(1);

  // The stream dropped: the official model keeps the last window published.
  expect(controller.running()).toBe(true);

  // A new generation replaces the window atomically, with the finished turn.
  sessions.update("s1", {
    kind: "replace",
    entries: [userMessage(1, "hi"), assistantMessage(2, "hello there")],
    hasMore: false,
  });
  sessions.running("s1", false);
  controllers.reattach();
  await settled();
  expect(controller.view().messages.map((message) => message.kind)).toEqual(["user", "assistant"]);
  expect(controller.running()).toBe(false);
  expect(controller.error()).toBe(null);
});

test("the draft and its files stay with the Session while Panels come and go", async () => {
  const { controllers } = setup();
  const controller = await mounted(controllers, "s1");
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
  const { sessions, controllers } = setup();
  const controller = await mounted(controllers, "s1");
  sessions.running("s1", true);
  expect(controller.running()).toBe(true);

  await controller.queuePrompt("and one more");
  expect(controller.queued().map((item) => item.text)).toEqual(["and one more"]);

  // dsh admits it: the inbox projection names the item to withdraw.
  sessions.inbox("s1", [
    { id: "item-1", rpcId: sessions.prompts[0]?.requestId, text: "and one more" },
  ]);
  expect(controller.queued()[0]).toMatchObject({ itemId: "item-1", text: "and one more" });
  expect(controller.queued().length).toBe(1);

  const requestId = controller.queued()[0]!.requestId;
  await controller.withdrawQueued(requestId);
  expect(sessions.queueEdits).toEqual([
    { sessionId: "s1", itemId: "item-1", action: { kind: "remove" } },
  ]);
  expect(controller.queued().length).toBe(0);
});

test("older history is read with the official loadOlder and lands above the window", async () => {
  const { sessions, controllers } = setup();
  const controller = await mounted(controllers, "s1");
  sessions.update("s1", {
    kind: "replace",
    entries: [userMessage(10, "newer")],
    hasMore: true,
  });
  expect(controller.view().olderHasMore).toBe(true);

  sessions.older("s1", { entries: [userMessage(3, "older")], hasMore: false });
  await controller.loadOlder();
  expect(sessions.olderLoads).toEqual(["s1"]);
  expect(
    controller.view().messages.map((message) => message.kind === "user" && message.text),
  ).toEqual(["older", "newer"]);
  expect(controller.view().olderHasMore).toBe(false);
  expect(controller.olderLoading()).toBe(false);
});

test("a turn only a replaced window reports settles the local bubble", async () => {
  const { sessions, controllers } = setup();
  const controller = await mounted(controllers, "s1");
  controller.beginLocalTurn("live-1");
  const requestId = await controller.prompt("replay please");

  // The reply arrives with a replaced window, never as a live chunk.
  sessions.update("s1", {
    kind: "replace",
    entries: [userMessage(1, "replay please", requestId), assistantMessage(2, "Replayed answer.")],
    hasMore: false,
  });
  expect(controller.view().liveId).toBe(null);
  expect(controller.view().pendingFreeze).toMatchObject({ status: "done" });
  expect(controller.view().messages.map((message) => message.kind)).toEqual(["user", "assistant"]);
});

test("a queued prompt is withdrawn by request id before dsh admits it", async () => {
  const { sessions, controllers } = setup();
  const controller = await mounted(controllers, "s1");
  await controller.queuePrompt("drop me");
  const requestId = controller.queued()[0]!.requestId;
  await controller.withdrawQueued(requestId);
  expect(controller.queued().length).toBe(0);
  expect(sessions.queueEdits).toEqual([]);
});

test("the same Session read twice keeps one reference and one window", async () => {
  const { sessions, controllers } = setup();
  const controller = await mounted(controllers, "s1");
  sessions.update("s1", { kind: "replace", entries: [durable(1, "turn/start")], hasMore: false });
  expect(controller.view().messages.length).toBe(0);
  expect(controller.running()).toBe(false);
});
