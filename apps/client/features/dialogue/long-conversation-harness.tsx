/**
 * Test-only entry: one Bot's long conversation over a scripted official
 * Session model. Two segments in two directories; the older one is only read
 * when the transcript reaches the top or the history rail jumps to it. `nsh
 * test` opens it; nothing in the product imports it.
 */
import { cleanup, effect, mount, signal, Text, View } from "nsh";

import {
  assistantMessage,
  durable,
  scriptedHost,
  scriptedSessions,
  userMessage,
  type ScriptedSessions,
} from "../../test/sessions";
import { workspaceProjection, workspaceRow } from "../../test/workspaces";
import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  renameSegment,
  type BotRegistry,
} from "../bots/model";
import { ready, registry } from "../bots/state";
import { setSegmentStarter, type SegmentStarter } from "../workspace/conversation";
import { workspaces } from "../workspace/state";
import { ChatPane } from "./ChatPane";
import type { SessionHost } from "./session/claimed";
import { SessionRegistry } from "./session/controller";
import { sessionError } from "./session/runtime";

const BOT = "ada";
const FIRST = "s1";
const SECOND = "s2";
const WS_A = "ws-a";
const WS_B = "ws-b";
const WS_C = "ws-c";

function harnessRegistry(): BotRegistry {
  let state = initializeBot(
    createBot(
      createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
      { name: "Ada", templateId: "tmpl" },
      BOT,
    ),
    BOT,
  );
  state = claimSegment(state, BOT, FIRST, WS_A);
  state = claimSegment(state, BOT, SECOND, WS_B);
  state = renameSegment(state, BOT, FIRST, "Earlier topic");
  return renameSegment(state, BOT, SECOND, "Today's topic");
}

/** A scripted Session model whose prompts are reported and answered at once. */
function scriptedChat(onPromptText: (text: string) => void): {
  sessions: ScriptedSessions;
  host: SessionHost;
} {
  const sessions = scriptedSessions([FIRST, SECOND]);
  const host = scriptedHost(sessions);
  const seqs = new Map<string, number>([
    [FIRST, 2],
    [SECOND, 2],
  ]);
  const seqOf = (sessionId: string) => {
    const next = (seqs.get(sessionId) ?? 0) + 1;
    seqs.set(sessionId, next);
    return next;
  };
  sessions.update(FIRST, {
    kind: "replace",
    entries: [userMessage(1, "the earlier question"), assistantMessage(2, "the earlier answer")],
    hasMore: false,
  });
  sessions.update(SECOND, {
    kind: "replace",
    entries: [userMessage(1, "the current question"), assistantMessage(2, "the current answer")],
    hasMore: false,
  });
  // Enough history that the current segment really scrolls.
  for (let index = 0; index < 20; index++) {
    sessions.update(SECOND, {
      kind: "append",
      entry: userMessage(seqOf(SECOND), `follow-up question ${index}`),
    });
    sessions.update(SECOND, {
      kind: "append",
      entry: assistantMessage(seqOf(SECOND), `follow-up answer ${index}`),
    });
  }
  sessions.row(FIRST, { updatedAt: Date.parse("2026-02-02T09:00:00.000Z") });
  sessions.row(SECOND, { updatedAt: Date.parse("2026-02-03T09:00:00.000Z") });
  sessions.onPrompt = (prompt) => {
    onPromptText(`prompt:${prompt.sessionId}:${prompt.text}`);
    sessions.update(prompt.sessionId, {
      kind: "append",
      entry: durable(seqOf(prompt.sessionId), "user/message", {
        content: prompt.text,
        source: { kind: "user", rpcId: prompt.requestId },
      }),
    });
    sessions.update(prompt.sessionId, {
      kind: "append",
      entry: assistantMessage(seqOf(prompt.sessionId), "answer from the latest segment"),
    });
    sessions.update(prompt.sessionId, {
      kind: "append",
      entry: durable(seqOf(prompt.sessionId), "turn/end", { reason: { kind: "completed" } }),
    });
    sessions.running(prompt.sessionId, false);
  };
  return { sessions, host };
}

function Harness() {
  registry.set(harnessRegistry());
  ready.set(true);
  workspaces.set(
    workspaceProjection({
      rows: [
        workspaceRow({ id: WS_A, path: "/proj-a", title: "proj-a", sessionIds: [FIRST] }),
        workspaceRow({ id: WS_B, path: "/proj-b", title: "proj-b", sessionIds: [SECOND] }),
        workspaceRow({ id: WS_C, path: "/proj-c", title: "proj-c", sessionIds: [] }),
      ],
    }),
  );

  const lastPrompt = signal("");
  const { sessions, host } = scriptedChat((text) => lastPrompt.set(text));
  const controllers = new SessionRegistry({
    ensureHost: async () => host,
    host: () => host,
    registry: () => registry(),
    sessionArchived: () => false,
    summaries: () => new Map(),
    onChange: () => undefined,
  });
  /** The Bot's latest segment; a new one becomes the Pane's current chat. */
  const latestId = () =>
    registry()
      .bots.find((bot) => bot.id === BOT)
      ?.segments.at(-1)?.sessionId ?? SECOND;

  let nextSession = 2;
  const starter: SegmentStarter = {
    async workspace(path) {
      const id = path.includes("proj-c") ? WS_C : path.includes("proj-b") ? WS_B : WS_A;
      return { id };
    },
    async createSession(botId, workspaceId) {
      const id = `s${++nextSession}`;
      sessions.row(id, { blank: true, updatedAt: Date.now() });
      registry.set(claimSegment(registry(), botId, id, workspaceId));
      return id;
    },
    async rememberPath() {
      // The harness Bot's directory is its latest segment's path.
    },
    async pickDirectory() {
      return null;
    },
  };
  setSegmentStarter(starter);

  effect(() => {
    const latest = controllers.controllerFor(latestId());
    latest.mount();
    cleanup(() => latest.unmount());
  });

  return (
    <View style={{ flex: 1, backgroundColor: "#ffffff" }}>
      <View style={{ height: 26, justifyContent: "center", paddingHorizontal: 12 }}>
        <Text testID="last-prompt" style={{ fontSize: 12 }}>
          {lastPrompt()}
        </Text>
        <Text style={{ fontSize: 11 }}>{sessionError() ?? ""}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <ChatPane
          controller={controllers.controllerFor(latestId())}
          history
          controllerOf={(sessionId) => controllers.controllerFor(sessionId)}
        />
      </View>
    </View>
  );
}

mount(Harness);
