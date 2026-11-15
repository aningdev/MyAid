/**
 * Test-only entry: two Sessions' chats over a scripted official Session model,
 * so the transcript and the composer can be driven without a Host. `nsh test`
 * opens it; nothing in the product imports it.
 *
 * A prompt's first word picks the script:
 * - "slow …": a reply that streams a word every 300 ms (Stop, queued prompts);
 * - "tools …": a reply with three tool calls and their results;
 * - "long …": eighteen finished exchanges, to scroll a transcript;
 * - "numbered …": a reply that is one 22-item ordered list (marker width);
 * - "rich …": a reply with a heading, a link, a code block and a table;
 * - "picture …": a reply with one image;
 * - "replay …": a turn the client missed: a window with its finished
 *   exchange and no live chunks;
 * - "running …": a tool call that never returns, so its row spins;
 * - "older …": a long conversation with a page of older history on its way
 *   (the list's header is the shape of what is coming);
 * - "approve …": a tool call waiting on the person (the approval card);
 * - "error …": a turn that failed (the reply's error row);
 * - "fail …": a Session that lost its connection (the Pane's banner);
 * - anything else: a short reply, in three chunks.
 */
import { mount, signal, Text, token, View } from "nsh";

import { Pressable } from "../../../components/ui/pressable";
import {
  assistantMessage,
  durable,
  liveChunk,
  scriptedHost,
  scriptedSessions,
  userMessage,
  type ScriptedSessions,
} from "../../../test/sessions";
import { workspaceProjection, workspaceRow } from "../../../test/workspaces";
import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  type BotRegistry,
} from "../../bots/model";
import { ready, registry } from "../../bots/state";
import { workspaces } from "../../workspace/state";
import { ChatPane } from "../ChatPane";
import type { SessionHost } from "../session/claimed";
import { SessionRegistry } from "../session/controller";

const BOT = "bot";
const WORKSPACE = "ws-work";
const FIRST = "s1";
const SECOND = "s2";

/** A 22-item ordered list: markers 10 to 22 take two digits, which the indent must hold. */
export const NUMBERED_COUNT = 22;
const NUMBERED = Array.from({ length: NUMBERED_COUNT }, (_, index) => {
  const number = index + 1;
  return `${number}. Item ${number} of ${NUMBERED_COUNT} in this numbered list.`;
}).join("\n");

/** A reply with the Markdown a chat shows: a heading, links, a code block, a table and an image. */
const RICH = [
  "## A short answer",
  "",
  "Markdown arrives **bold**, *italic*, `inline code` and a [link](https://nsh.dev).",
  "",
  "```ts",
  "const answer = 42;",
  "console.log(answer);",
  "```",
  "",
  "| Step | What it does |",
  "| ---- | ------------ |",
  "| 1    | Read the file |",
  "| 2    | Write it back |",
].join("\n");

/** A reply with one image: a press on it opens the viewer (`ImageViewer`). */
const PICTURE = "![MyAid](asset:/assets/icon.png)";

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
  return claimSegment(
    claimSegment(
      initializeBot(
        createBot(
          createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
          { name: "Ada", templateId: "tmpl" },
          BOT,
        ),
        BOT,
      ),
      BOT,
      FIRST,
      WORKSPACE,
    ),
    BOT,
    SECOND,
    WORKSPACE,
  );
}

/**
 * What a script reaches for once the Panes' controllers are made: an approval
 * raised on a Session, and a Session that lost its connection. \`Harness\`
 * installs it; until then a script that asks for one gets nothing.
 */
let scriptedPane: {
  approve(sessionId: string): void;
  fail(sessionId: string): void;
} | null = null;

/** A scripted Session model that answers a prompt with a script, and queues the rest. */
function scriptedChat(): { sessions: ScriptedSessions; host: SessionHost } {
  const sessions = scriptedSessions([FIRST, SECOND]);
  const host = scriptedHost(sessions);
  const running = new Set<string>();
  const timers = new Map<string, ReturnType<typeof setInterval>>();
  const seqs = new Map<string, number>();
  const queues = new Map<string, { id: string; rpcId: string; text: string }[]>();
  let queuedItems = 0;

  const seqOf = (sessionId: string) => {
    const next = (seqs.get(sessionId) ?? 0) + 1;
    seqs.set(sessionId, next);
    return next;
  };

  const event = (sessionId: string, type: string, data: unknown = {}) =>
    sessions.update(sessionId, {
      kind: "append",
      entry: durable(seqOf(sessionId), type, data as Record<string, unknown>),
    });

  const chunk = (sessionId: string, text: string) =>
    sessions.update(sessionId, {
      kind: "append",
      entry: liveChunk(seqOf(sessionId), "a1", text),
    });

  const finish = (sessionId: string, text: string) => {
    timers.delete(sessionId);
    running.delete(sessionId);
    sessions.update(sessionId, {
      kind: "append",
      entry: assistantMessage(seqOf(sessionId), text),
    });
    event(sessionId, "turn/end", { reason: { kind: "completed" } });
    sessions.running(sessionId, false);
  };

  const run = (sessionId: string, text: string) => {
    const first = text.split(/\s+/)[0] ?? "";
    running.add(sessionId);
    sessions.running(sessionId, true);
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
      sessions.update(sessionId, {
        kind: "append",
        entry: durable(seqOf(sessionId), "assistant/message", {
          message: {
            content: [
              { type: "reasoning", text: "I should look at three files." },
              { type: "tool-call", id: "t0", name: "read_file", arguments: '{"path":"file-0.ts"}' },
              { type: "tool-call", id: "t1", name: "grep", arguments: '{"pattern":"answer"}' },
              { type: "tool-call", id: "t2", name: "run", arguments: '{"script":"bun test"}' },
              { type: "text", text: "Read three files. **Done.**" },
            ],
          },
        }),
      });
      event(sessionId, "turn/end", { reason: { kind: "completed" } });
      running.delete(sessionId);
      sessions.running(sessionId, false);
      return;
    }
    if (first === "numbered") {
      sessions.update(sessionId, {
        kind: "append",
        entry: assistantMessage(seqOf(sessionId), NUMBERED),
      });
      event(sessionId, "turn/end", { reason: { kind: "completed" } });
      running.delete(sessionId);
      sessions.running(sessionId, false);
      return;
    }
    if (first === "rich" || first === "picture") {
      sessions.update(sessionId, {
        kind: "append",
        entry: assistantMessage(seqOf(sessionId), first === "rich" ? RICH : PICTURE),
      });
      event(sessionId, "turn/end", { reason: { kind: "completed" } });
      running.delete(sessionId);
      sessions.running(sessionId, false);
      return;
    }
    if (first === "replay") {
      // The window recovered after the turn: one replacement holds the
      // finished exchange, with no active attempt and no live chunks.
      sessions.update(sessionId, {
        kind: "replace",
        entries: [
          userMessage(seqOf(sessionId), text),
          assistantMessage(seqOf(sessionId), "Replayed answer."),
        ],
        hasMore: false,
      });
      running.delete(sessionId);
      sessions.running(sessionId, false);
      return;
    }
    if (first === "running") {
      // A tool call that never returns: its row spins, and so does the reply.
      event(sessionId, "tool/call", {
        callId: "t9",
        name: "run",
        arguments: JSON.stringify({ script: "bun test" }),
      });
      return;
    }
    if (first === "older") {
      // A long history with a page of older messages on its way above it: the
      // list's header draws the shape of what is coming.
      sessions.update(sessionId, {
        kind: "replace",
        entries: Array.from({ length: 6 }, (_, index) =>
          index % 2 === 0
            ? userMessage(seqOf(sessionId), `earlier question ${index}`)
            : assistantMessage(seqOf(sessionId), `earlier answer ${index}`),
        ),
        hasMore: true,
      });
      sessions.loadingOlder(sessionId, true);
      event(sessionId, "turn/end", { reason: { kind: "completed" } });
      running.delete(sessionId);
      sessions.running(sessionId, false);
      return;
    }
    if (first === "approve") {
      // A tool call waiting on the person: the card above the composer.
      scriptedPane?.approve(sessionId);
      return;
    }
    if (first === "error") {
      // The turn failed: the reply's error row, with its message and Retry.
      sessions.update(sessionId, {
        kind: "append",
        entry: assistantMessage(seqOf(sessionId), "Reading the log…"),
      });
      event(sessionId, "turn/end", {
        reason: { kind: "error", error: { message: "the tool call failed" } },
      });
      running.delete(sessionId);
      sessions.running(sessionId, false);
      return;
    }
    if (first === "fail") {
      // The Session lost its connection: the Pane's banner and the reply's error.
      scriptedPane?.fail(sessionId);
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
      sessions.update(sessionId, {
        kind: "append",
        entry: assistantMessage(seqOf(sessionId), `${few}\n\n${paragraphs.join("\n\n")}`),
      });
      event(sessionId, "turn/end", { reason: { kind: "completed" } });
      running.delete(sessionId);
      sessions.running(sessionId, false);
      return;
    }
    if (first === "long") {
      for (let index = 0; index < 18; index++) {
        event(sessionId, "user/message", {
          content: `question ${index}`,
          source: { kind: "user" },
        });
        sessions.update(sessionId, {
          kind: "append",
          entry: assistantMessage(
            seqOf(sessionId),
            `Answer ${index}.\n\n\`\`\`ts\nconst answer${index} = ${index};\n\`\`\``,
          ),
        });
      }
      finish(sessionId, "That is the whole thread.");
      return;
    }
    const slow = first === "slow";
    const words = slow ? SLOW_WORDS : ["Done", "with", "that", "."];
    // The first word lands with the send, so a reply is on screen while the
    // rest streams (and while Stop is pressed).
    chunk(sessionId, words[0] as string);
    let index = 1;
    const timer = setInterval(
      () => {
        if (index >= words.length) {
          if (!slow) finish(sessionId, words.join(" "));
          return;
        }
        chunk(sessionId, ` ${words[index]}`);
        index += 1;
      },
      slow ? 300 : 120,
    );
    timers.set(sessionId, timer);
  };

  sessions.onCancel = (sessionId) => {
    const timer = timers.get(sessionId);
    if (timer !== undefined) clearInterval(timer);
    timers.delete(sessionId);
    if (!running.has(sessionId)) return;
    running.delete(sessionId);
    event(sessionId, "turn/end", { reason: { kind: "interrupted" } });
    sessions.running(sessionId, false);
  };

  sessions.onPrompt = (prompt) => {
    if (running.has(prompt.sessionId)) {
      const pending = [
        ...(queues.get(prompt.sessionId) ?? []),
        { id: `item-${++queuedItems}`, rpcId: prompt.requestId, text: prompt.text },
      ];
      queues.set(prompt.sessionId, pending);
      sessions.inbox(prompt.sessionId, pending);
      return;
    }
    if (prompt.text.trim().split(/\s+/)[0] === "replay") {
      run(prompt.sessionId, prompt.text);
      return;
    }
    event(prompt.sessionId, "user/message", {
      content: prompt.text,
      source: { kind: "user", rpcId: prompt.requestId },
    });
    run(prompt.sessionId, prompt.text);
  };

  return { sessions, host };
}

function Harness() {
  registry.set(harnessRegistry());
  ready.set(true);
  workspaces.set(
    workspaceProjection({
      rows: [workspaceRow({ id: WORKSPACE, path: "/work/myaid", sessionIds: [SECOND, FIRST] })],
    }),
  );

  const { sessions, host } = scriptedChat();
  const controllers = new SessionRegistry({
    ensureHost: async () => host,
    host: () => host,
    registry: () => registry(),
    sessionArchived: () => false,
    summaries: () => new Map(),
    onChange: () => undefined,
    onView: (sessionId, view) => {
      const user = view.messages.find((message) => message.kind === "user" && message.text);
      if (user) sessions.row(sessionId, { blank: false });
    },
  });
  const first = controllers.controllerFor(FIRST);
  const second = controllers.controllerFor(SECOND);
  first.mount();
  second.mount();
  // What the scripts reach for: a tool call waiting on the person, and a
  // Session whose connection dropped.
  scriptedPane = {
    approve: (sessionId) => {
      controllers.controllerFor(sessionId).requestApproval({
        sessionId,
        toolName: "Bash",
        reason: "run a command in the workspace",
        details: '{"command":"bun test"}',
      });
    },
    fail: (sessionId) => {
      const controller = controllers.controllerFor(sessionId);
      // A turn that was under way, whose connection dropped: the reply's error
      // row, and the Pane's banner above it.
      controller.beginLocalTurn("local-error");
      controller.applyError("dsh: the connection dropped");
    },
  };

  const which = signal(0);
  return (
    <View style={{ flex: 1, backgroundColor: token("background") }}>
      <Pressable onPress={() => which.set(which() === 0 ? 1 : 0)} accessibilityLabel="Switch panel">
        <View style={{ height: 28, paddingHorizontal: 12, justifyContent: "center" }}>
          <Text style={{ fontSize: 12 }}>Switch panel</Text>
        </View>
      </Pressable>
      <View style={{ flex: 1 }}>
        <If when={which() === 0} else={<ChatPane controller={second} />}>
          <ChatPane controller={first} />
        </If>
      </View>
    </View>
  );
}

mount(Harness);
