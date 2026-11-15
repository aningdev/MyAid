/**
 * Test-only entry: the marks at work, in the parts of the app that carry them —
 * the Navigator's rows, the Pane's title and a message row of a reply that is
 * still streaming in — beside the clock's hold, which freezes every mark at one
 * moment so a picture is the same picture twice.
 *
 * A running turn needs a Session model, and the shell's is the official one
 * behind a Host; this screen gives the Pane a scripted Session instead, so the
 * turn under way is real to the components and needs no Host. Nothing in the
 * product imports this file; `screens/avatar-b-shots.test.tsx` opens it.
 */
import { mount, signal, Text, token, View } from "nsh";

import { botList } from "../components/shell/botList";
import { Pressable } from "../components/ui/pressable";
import { holdAvatarClock } from "../features/bots/avatarClock";
import { BotMark } from "../features/bots/BotMark";
import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  type BotRegistry,
} from "../features/bots/model";
import { ready, registry } from "../features/bots/state";
import { ChatPane } from "../features/dialogue/ChatPane";
import type { SessionHost } from "../features/dialogue/session/claimed";
import { SessionRegistry } from "../features/dialogue/session/controller";
import type { SessionRow } from "../features/dialogue/session/roster";
import { workspaces } from "../features/workspace/state";
import {
  durable,
  liveChunk,
  scriptedHost,
  scriptedSessions,
  type ScriptedSessions,
} from "../test/sessions";
import { workspaceProjection, workspaceRow } from "../test/workspaces";

const ADA = "ada";
const IOTA = "iota";
const SHELL = "shell";
const SESSION = "s-ada";
const WORKSPACE = "ws-ada";

/** The moments the picture can be held at, in milliseconds: the breath's extremes and a scan. */
const MOMENTS = [0, 200, 400, 800, 1200] as const;

function harnessRegistry(): BotRegistry {
  let built = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  const bots = [
    { id: ADA, name: "Ada", identity: { color: "teal", shape: "round", face: "calm" } },
    { id: IOTA, name: "Iota", identity: { color: "violet", shape: "triangle", face: "happy" } },
    { id: SHELL, name: "Shell", identity: { color: "amber", shape: "star", face: "curious" } },
  ] as const;
  for (const bot of bots) {
    built = initializeBot(
      createBot(built, { name: bot.name, templateId: "tmpl", identity: bot.identity }, bot.id),
      bot.id,
    );
  }
  return claimSegment(built, ADA, SESSION, WORKSPACE);
}

/**
 * The roster the list reads: two Bots have a turn running (Ada's Pane is the
 * one on screen) and one is quiet.
 */
function roster(): SessionRow[] {
  const row = (botId: string, botName: string, running: boolean): SessionRow => ({
    id: `${botId}-session`,
    botId,
    botName,
    workspacePath: "/work/myaid",
    label: `${botName}'s session`,
    detail: botName,
    updatedAt: null,
    missing: false,
    running,
    unread: false,
    attention: false,
  });
  return [row(ADA, "Ada", true), row(IOTA, "Iota", true), row(SHELL, "Shell", false)];
}

/**
 * A reply that is still arriving: the prompt appends what was said, then one
 * chunk of the answer, and the turn stays open — no timer, so the picture of a
 * turn under way does not depend on how many times a clock ticked.
 */
function scriptedTurn(): { sessions: ScriptedSessions; host: SessionHost } {
  const sessions = scriptedSessions([SESSION]);
  const host = scriptedHost(sessions);
  let seq = 0;
  const event = (type: string, data: unknown) =>
    sessions.update(SESSION, {
      kind: "append",
      entry: durable(++seq, type, data as Record<string, unknown>),
    });
  const REPLY = "Reading the two files you named, then the tests that cover them.";
  sessions.onPrompt = (prompt) => {
    event("user/message", {
      content: prompt.text,
      source: { kind: "user", rpcId: prompt.requestId },
    });
    sessions.running(SESSION, true);
    sessions.update(SESSION, { kind: "append", entry: liveChunk(++seq, "a1", REPLY) });
  };
  sessions.onCancel = () => {
    event("turn/end", { reason: { kind: "interrupted" } });
    sessions.running(SESSION, false);
  };
  return { sessions, host };
}

function Harness() {
  // The one moment every mark is held at: a picture, and the same one twice.
  const moment = signal<number | null>(400);
  holdAvatarClock(moment());

  registry.set(harnessRegistry());
  ready.set(true);
  workspaces.set(
    workspaceProjection({
      rows: [workspaceRow({ id: WORKSPACE, path: "/work/myaid", sessionIds: [SESSION] })],
    }),
  );

  const { sessions, host } = scriptedTurn();
  const controllers = new SessionRegistry({
    ensureHost: async () => host,
    host: () => host,
    registry: () => registry(),
    sessionArchived: () => false,
    summaries: () => new Map(),
    onChange: () => undefined,
    onView: () => undefined,
  });
  const controller = controllers.controllerFor(SESSION);
  controller.mount();

  const list = () =>
    botList({ registry: registry(), workspaces: workspaces(), rows: roster(), pins: [ADA] });

  const hold = (value: number | null) => {
    moment.set(value);
    holdAvatarClock(value);
  };

  return (
    <View
      testID="avatar-b-working-harness"
      style={{ flex: 1, backgroundColor: token("background") }}
    >
      {/* The clock's hold: the moment every mark on the screen is frozen at. */}
      <View
        style={{
          flexDirection: "row",
          gap: 6,
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderBottomWidth: 1,
          borderBottomColor: token("line"),
        }}
      >
        <Text style={{ fontSize: 11, color: token("muted-foreground") }}>held at</Text>
        <Each of={MOMENTS}>
          {(value) => (
            <Pressable
              testID={`hold-${value()}`}
              onPress={() => hold(value())}
              selected={moment() === value()}
              accessibilityLabel={`Hold at ${value()}`}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: moment() === value() ? token("foreground") : token("border"),
              }}
            >
              <Text style={{ fontSize: 11, color: token("foreground") }}>{`${value()}ms`}</Text>
            </Pressable>
          )}
        </Each>
        <Pressable
          testID="hold-live"
          onPress={() => hold(null)}
          selected={moment() === null}
          accessibilityLabel="Live clock"
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: moment() === null ? token("foreground") : token("border"),
          }}
        >
          <Text style={{ fontSize: 11, color: token("foreground") }}>live</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* The Navigator's column: its rows, drawn here so the picture can carry
          a running turn without a Host behind it. */}
        <View style={{ width: 240, backgroundColor: token("inset"), padding: 8, gap: 2 }}>
          <Text
            testID="list-title"
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: token("muted-foreground"),
              padding: 6,
            }}
          >
            Pinned
          </Text>
          <Each of={[...list().pinned, ...list().others]} key={(row) => row.bot.id}>
            {(row) => (
              <View
                testID={`list-row-${row().bot.id}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 6,
                  paddingVertical: 3,
                  minHeight: 30,
                  borderRadius: 8,
                  backgroundColor: row().bot.id === ADA ? token("raised") : "transparent",
                }}
              >
                <BotMark identity={row().bot.identity} size={18} working={row().working} />
                <Text
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 13,
                    color: token("foreground"),
                    numberOfLines: 1,
                  }}
                >
                  {row().bot.name}
                </Text>
                <If when={row().working}>
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: token("up"),
                    }}
                  />
                </If>
              </View>
            )}
          </Each>
        </View>
        {/* The Pane: its title row carries the 20px mark and the reply's rows the
          22px one, both of them at work while the reply streams. */}
        <View style={{ flex: 1, minWidth: 0, backgroundColor: token("background") }}>
          <ChatPane controller={controller} />
        </View>
      </View>
    </View>
  );
}

mount(Harness);
