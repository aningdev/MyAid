/**
 * Test-only entry: two Sessions' chats over a scripted transport, so the
 * transcript and the composer can be driven without a Host. `nsh test` opens
 * it; nothing in the product imports it.
 *
 * A prompt's first word picks the script:
 * - "slow …": a reply that streams a word every 40 ms (Stop, queued prompts);
 * - "tools …": a reply with three tool calls and their results;
 * - "long …": eighteen finished exchanges, to scroll a transcript;
 * - anything else: a short reply, in three chunks.
 */
import type { SessionFollowFrame } from "@myaid/dsh-web-protocol/session";
import { mount, signal, Text, View } from "nsh";

import { Press } from "../../../components/ui";
import {
  claimSession,
  createBot,
  createDialogue,
  createTemplate,
  emptyRegistry,
  initializeBot,
  type BotRegistry,
} from "../../bots/model";
import { ready, registry } from "../../bots/state";
import { ChatPane } from "../ChatPane";
import {
  type ApprovalDecision,
  type ApprovalRequest,
  type FlatModelCatalog,
  type SessionTransport,
} from "../session/claimed";
import { SessionRegistry } from "../session/controller";

type Sink = (frame: SessionFollowFrame) => void;
type Queued = { id: string; requestId: string; text: string };

const BOT = "bot";
const DIALOGUE = "dlg";
const FIRST = "s1";
const SECOND = "s2";

const SLOW_WORDS = [
  "This",
  "reply",
  "keeps",
  "the",
  "words",
  "it",
  "had",
  "shown",
  "when",
  "the",
  "person",
  "stops",
  "it,",
  "and",
  "says",
  "so.",
];

function harnessRegistry(): BotRegistry {
  return claimSession(
    claimSession(
      createDialogue(
        initializeBot(
          createBot(
            createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
            { name: "Ada", templateId: "tmpl" },
            BOT,
          ),
          BOT,
        ),
        { botId: BOT, workspacePath: "/work/myaid" },
        DIALOGUE,
      ),
      DIALOGUE,
      FIRST,
    ),
    DIALOGUE,
    SECOND,
  );
}

/** A transport that answers a prompt with a script, and queues the rest. */
function scriptedTransport(): SessionTransport {
  const sinks = new Map<string, Sink[]>();
  const queues = new Map<string, Queued[]>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const seqs = new Map<string, number>();
  let items = 0;

  // Frames arrive on their own tick, as a real follow stream does: delivering
  // one inside `prompt` or `cancel` would run the Pane's effects mid-call.
  const emit = (sessionId: string, value: unknown) => {
    queueMicrotask(() => {
      for (const sink of sinks.get(sessionId) ?? []) sink(value as SessionFollowFrame);
    });
  };

  const seqOf = (sessionId: string) => {
    const next = (seqs.get(sessionId) ?? 0) + 1;
    seqs.set(sessionId, next);
    return next;
  };

  const event = (sessionId: string, type: string, data: unknown = {}) =>
    emit(sessionId, {
      type: "event",
      event: { seq: seqOf(sessionId), type, time: Date.now(), data },
    });

  const chunk = (sessionId: string, text: string) =>
    emit(sessionId, {
      type: "assistant-stream",
      frame: {
        type: "chunk",
        attemptId: "a1",
        revision: 1,
        index: seqOf(sessionId),
        time: Date.now(),
        chunk: { type: "text-delta", text },
      },
    });

  const finish = (sessionId: string, text: string) => {
    timers.delete(sessionId);
    event(sessionId, "assistant/message", { message: { content: [{ type: "text", text }] } });
    event(sessionId, "turn/end", { reason: { kind: "completed" } });
  };

  const run = (sessionId: string, text: string) => {
    const first = text.split(/\s+/)[0] ?? "";
    if (first === "tools") {
      for (const [index, name] of ["read_file", "grep", "run"].entries()) {
        event(sessionId, "tool/call", {
          callId: `t${index}`,
          name,
          arguments: JSON.stringify({ path: `/work/myaid/file-${index}.ts` }),
        });
        event(sessionId, "tool/result", {
          message: {
            toolCallId: `t${index}`,
            content: [{ type: "text", text: `result ${index}` }],
          },
        });
      }
      event(sessionId, "assistant/message", {
        message: {
          content: [
            { type: "reasoning", text: "I should look at three files." },
            { type: "tool-call", id: "t0", name: "read_file", arguments: '{"path":"file-0.ts"}' },
            { type: "tool-call", id: "t1", name: "grep", arguments: '{"pattern":"answer"}' },
            { type: "tool-call", id: "t2", name: "run", arguments: '{"script":"bun test"}' },
            { type: "text", text: "Read three files. **Done.**" },
          ],
        },
      });
      event(sessionId, "turn/end", { reason: { kind: "completed" } });
      return;
    }
    if (first === "huge") {
      const paragraphs: string[] = [];
      for (let index = 0; index < 160; index++) {
        paragraphs.push(
          `Paragraph ${index}. ${"Keep the reading position while the reply streams. ".repeat(4)}`,
        );
      }
      const few = paragraphs.slice(0, 4).join("\n\n");
      event(sessionId, "assistant/message", {
        message: { content: [{ type: "text", text: `${few}\n\n${paragraphs.join("\n\n")}` }] },
      });
      event(sessionId, "turn/end", { reason: { kind: "completed" } });
      return;
    }
    if (first === "long") {
      for (let index = 0; index < 18; index++) {
        event(sessionId, "user/message", {
          content: `question ${index}`,
          source: { kind: "user" },
        });
        event(sessionId, "assistant/message", {
          message: {
            content: [
              {
                type: "text",
                text: `Answer ${index}.\n\n\`\`\`ts\nconst answer${index} = ${index};\n\`\`\``,
              },
            ],
          },
        });
      }
      finish(sessionId, "That is the whole thread.");
      return;
    }
    const slow = first === "slow";
    const words = slow ? SLOW_WORDS : ["Done", "with", "that", "."];
    emit(sessionId, {
      type: "assistant-stream",
      frame: {
        type: "start",
        attemptId: "a1",
        revision: 1,
        startedAfterSeq: 0,
        turn: 1,
        step: 1,
        nextIndex: 0,
      },
    });
    // The first word lands with the send, so a reply is on screen while the
    // rest streams (and while Stop is pressed).
    chunk(sessionId, words[0]);
    let index = 1;
    if (slow) {
      const timer = setInterval(() => {
        if (index >= words.length) return;
        chunk(sessionId, ` ${words[index]}`);
        index += 1;
      }, 300);
      timers.set(sessionId, timer);
      return;
    }
    const timer = setInterval(() => {
      if (index >= words.length) {
        clearInterval(timer);
        finish(sessionId, words.join(" "));
        return;
      }
      chunk(sessionId, ` ${words[index]}`);
      index += 1;
    }, 120);
    timers.set(sessionId, timer);
  };

  return {
    ready: true,
    createSession: async () => ({ sessionId: "new-session" }),
    listSessions: async () => [
      { sessionId: FIRST, blank: false, updatedAt: 1 },
      { sessionId: SECOND, blank: false, updatedAt: 2 },
    ],
    follow: (sessionId, onFrame) => {
      sinks.set(sessionId, [...(sinks.get(sessionId) ?? []), onFrame]);
      return () => {
        sinks.set(
          sessionId,
          (sinks.get(sessionId) ?? []).filter((sink) => sink !== onFrame),
        );
      };
    },
    sessionPage: async () => ({ records: [], hasMore: false }),
    sessionQueue: async (sessionId) => queues.get(sessionId) ?? [],
    prompt: async (request) => {
      const text = request.text ?? contentText(request.content);
      if (timers.has(request.sessionId)) {
        queues.set(request.sessionId, [
          ...(queues.get(request.sessionId) ?? []),
          { id: `item-${++items}`, requestId: request.requestId, text },
        ]);
        return;
      }
      event(request.sessionId, "user/message", { content: text, source: { kind: "user" } });
      event(request.sessionId, "turn/start");
      run(request.sessionId, text);
    },
    cancel: async (sessionId) => {
      const timer = timers.get(sessionId);
      if (timer !== undefined) clearInterval(timer);
      timers.delete(sessionId);
      event(sessionId, "turn/end", { reason: { kind: "interrupted" } });
    },
    withdrawQueuedPrompt: async (sessionId, itemId) => {
      queues.set(
        sessionId,
        (queues.get(sessionId) ?? []).filter((item) => item.id !== itemId),
      );
    },
    renameSession: async () => undefined,
    uploadFile: async () => ({ receiptId: "receipt" }),
    modelCatalog: async () =>
      ({
        default: { provider: "p", model: "m" },
        models: [{ provider: "p", providerName: "P", model: "m", name: "Model M" }],
        failures: [],
      }) satisfies FlatModelCatalog,
    selectModel: async () => undefined,
    selectAgentPreset: async () => "standard",
    approvals: (_handler: (request: ApprovalRequest) => Promise<ApprovalDecision>) => undefined,
    dispose: async () => undefined,
  };
}

/** The text parts of a prompt's content, as the Pane sends them. */
function contentText(content: readonly unknown[] | undefined): string {
  if (!content) return "";
  return content
    .map((part) => {
      const block = part as { type?: string; text?: string };
      return block.type === "text" ? (block.text ?? "") : "";
    })
    .join(" ");
}

function Harness() {
  registry.set(harnessRegistry());
  ready.set(true);

  const transport = scriptedTransport();
  const controllers = new SessionRegistry({
    ensureTransport: async () => transport,
    transport: () => transport,
    registry: () => registry(),
    summaries: () => new Map(),
    onChange: () => undefined,
  });
  const first = controllers.controllerFor(FIRST);
  const second = controllers.controllerFor(SECOND);
  first.mount();
  second.mount();

  const which = signal(0);
  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <Press onPress={() => which.set(which() === 0 ? 1 : 0)} accessibilityLabel="Switch panel">
        <View style={{ height: 28, paddingHorizontal: 12, justifyContent: "center" }}>
          <Text style={{ fontSize: 12 }}>Switch panel</Text>
        </View>
      </Press>
      <View style={{ flex: 1 }}>
        <If when={which() === 0} else={<ChatPane controller={second} />}>
          <ChatPane controller={first} />
        </If>
      </View>
    </View>
  );
}

mount(Harness);
