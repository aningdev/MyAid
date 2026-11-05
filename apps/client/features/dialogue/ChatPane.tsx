import {
  batch,
  cleanup,
  computed,
  effect,
  List,
  Scroll,
  signal,
  Text,
  View,
  type ListRef,
  type ViewStyle,
} from "nsh";
import { createAnimatedValue, LayoutAnimation } from "nsh";
import { Clipboard } from "nsh";
import { platform } from "nsh";
import { Picker } from "nsh";
import { keyboardFrame, safeAreaInsets } from "nsh";
import { Input } from "nsh/base";

import {
  alpha,
  Appear,
  Badge,
  colors,
  finish,
  IconTile,
  motion,
  Press,
  radius,
  RoundButton,
  toneTint,
} from "../../components/ui";
import { Glyph } from "./chat/glyphs";
import { Markdown } from "./chat/markdown";
import {
  ActionButton,
  Avatar,
  Caret,
  DateSeparator,
  ErrorRow,
  FileChip,
  Photo,
  Spinner,
  ToolCard,
} from "./chat/parts";
import { type FileRef, type Model, type Msg, type Status, type Tool } from "./chat/scripts";
import {
  cancelSession,
  connectSession,
  openSession,
  promptSession,
  resetLocalProjection,
  sessionError,
  sessionReady,
  subscribeSession,
} from "./session/runtime";
import { chatEpoch, model as chatModel, openContext } from "./state";

type Assistant = Extract<Msg, { kind: "assistant" }>;
type User = Extract<Msg, { kind: "user" }>;

/**
 * Dialogue main pane — official Session follow/prompt projection.
 */
export function ChatPane(props: { selectedId: string | null }) {
  const column: ViewStyle = { width: "100%", maxWidth: 820, alignSelf: "center" };
  const insets = safeAreaInsets();
  let ids = 0;
  const nextId = () => `m${ids++}`;

  const messages = signal<Msg[]>([]);
  const model = chatModel;
  const native = platform.idiom === "desktop" && platform.os !== "web";
  const useDsh = () => native && !!props.selectedId;
  const draft = signal("");
  const inputHeight = signal(20);
  const attachment = signal<{ image: string; file: FileRef } | null>(null);
  const menu = signal(false);
  const banner = signal<"offline" | "online" | null>(null);
  const bannerKind = signal<"offline" | "online">("offline");
  /** The copied message or code block, for a moment. */
  const copied = signal<string | null>(null);

  // The reply being written. Finished replies are plain data in `messages`.
  const liveId = signal<string | null>(null);
  const liveReason = signal("");
  const liveThinking = signal<{ start: number; seconds: number | null } | null>(null);
  const liveTools = signal<Tool[]>([]);
  const liveMd = signal("");
  const now = signal(0);

  /** Whether the user is at the bottom (the list then follows the stream
   * natively, `maintainVisibleContentPosition`); scrolling up clears it. */
  const following = signal(true);
  let list: ListRef | undefined;
  let dragging = false;

  type Run = {
    id: string;
    model: Model;
    script: string;
    cancelled: boolean;
    /** True after follow reports a turn actually started (avoids idle-snapshot freeze). */
    turned: boolean;
    md: string;
    reason: string;
    thinkStart: number;
    thinkSeconds: number | null;
  };
  let run: Run | null = null;

  /** Scrolls to the end on the user's own action (send, jump, load). */
  const toEnd = (animated = true) => {
    following.set(true);
    list?.scrollToEnd({ animated });
  };

  /** Freezes the reply into a message and ends the run. */
  const freeze = (r: Run, status: Status, error?: string) => {
    if (run !== r) return;
    const seconds =
      r.thinkSeconds ?? Math.max(1, Math.round((performance.now() - r.thinkStart) / 1000));
    const final: Assistant = {
      kind: "assistant",
      id: r.id,
      model: r.model,
      script: r.script,
      reasoning: r.reason ? { text: r.reason, seconds, open: false } : undefined,
      tools: liveTools().map((t) =>
        t.state === "done" ? t : ({ ...t, state: "cancelled" } as Tool),
      ),
      md: r.md,
      status,
      error,
    };
    run = null;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      messages.set(messages().map((m) => (m.id === r.id ? final : m)));
      liveId.set(null);
    });
    // The list follows the final layout natively; once the layout animation
    // has settled, make sure a following list ends exactly at the bottom.
    setTimeout(() => following() && list?.scrollToEnd({ animated: true }), 360);
  };

  const showConnectError = (error: unknown, at?: string) => {
    const msg = error instanceof Error ? error.message : String(error);
    const failId = at ?? nextId();
    const failed: Assistant = {
      kind: "assistant",
      id: failId,
      model: model(),
      script: "dsh",
      tools: [],
      md: "",
      status: "error",
      error: msg,
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      messages.set(
        at
          ? messages().map((m) => (m.id === at ? failed : m))
          : [
              ...(messages().length
                ? messages()
                : [{ kind: "date" as const, id: nextId(), label: "Today" }]),
              failed,
            ],
      );
      liveId.set(null);
      liveMd.set("");
    });
    // Host / backend setup lives in Context — open it when connect fails.
    if (/宿主|后台未|MYAID_DSH/.test(msg)) openContext();
  };

  /** Start a Session reply; `at` replaces that assistant bubble (retry / regenerate). */
  const replyDsh = async (text: string, at?: string) => {
    if (run) return;
    const r: Run = {
      id: at ?? nextId(),
      model: model(),
      script: "dsh",
      cancelled: false,
      turned: false,
      md: "",
      reason: "",
      thinkStart: performance.now(),
      thinkSeconds: null,
    };
    run = r;
    const placeholder: Assistant = {
      kind: "assistant",
      id: r.id,
      model: r.model,
      script: r.script,
      tools: [],
      md: "",
      status: "done",
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      liveReason.set("");
      liveThinking.set(null);
      liveTools.set([]);
      liveMd.set("");
      liveId.set(r.id);
      messages.set(
        at ? messages().map((m) => (m.id === at ? placeholder : m)) : [...messages(), placeholder],
      );
    });
    try {
      await promptSession(text);
    } catch (error) {
      freeze(r, "error", error instanceof Error ? error.message : String(error));
    }
  };

  const stop = () => {
    if (!run) return;
    run.cancelled = true;
    if (useDsh()) void cancelSession();
    freeze(run, "stopped");
  };

  cleanup(() => {
    if (run) run.cancelled = true;
  });

  // Project official Session follow frames into the primary pane.
  effect(() => {
    if (!useDsh()) return;
    const stopSub = subscribeSession((view) => {
      const r = run;
      if (!r || r.script !== "dsh") {
        if (!r && view.messages.length) {
          const projected: Msg[] = [
            { kind: "date", id: nextId(), label: "Today" },
            ...view.messages,
          ];
          if (view.running && view.liveMd) {
            const live: Assistant = {
              kind: "assistant",
              id: `live-${Date.now()}`,
              model: model(),
              script: "dsh",
              tools: [],
              md: view.liveMd,
              status: "done",
            };
            batch(() => {
              messages.set([...projected, live]);
              liveId.set(live.id);
              liveMd.set(view.liveMd);
            });
          } else {
            batch(() => {
              messages.set(projected);
              liveId.set(null);
              liveMd.set("");
            });
          }
        }
        return;
      }
      if (view.running || view.liveMd) r.turned = true;
      if (view.liveMd) {
        r.md = view.liveMd;
        liveMd.set(view.liveMd);
      }
      // Only freeze after a turn actually ran — idle follow snapshot must not
      // cancel a prompt that has not started yet (first-send race).
      if (!view.running && r.turned && r === run) {
        freeze(
          r,
          view.status.includes("失败")
            ? "error"
            : view.status.includes("停止")
              ? "stopped"
              : "done",
          view.status || undefined,
        );
      }
    });
    cleanup(stopSub);
  });

  effect(() => {
    const id = props.selectedId;
    chatEpoch();
    if (!useDsh() || !id) return;
    resetLocalProjection();
    messages.set([]);
    liveId.set(null);
    liveMd.set("");
    void openSession(id).catch(() => undefined);
  });

  effect(() => {
    const err = sessionError();
    if (useDsh() && err && run?.script === "dsh") {
      freeze(run, "error", err);
    }
  });

  const jumpToLatest = () => {
    toEnd();
  };

  /** Sends the user's message into the official Session. */
  const submit = async (text: string, image?: string, file?: FileRef) => {
    if (run) return;
    menu.set(false);
    following.set(true);
    if (!native) {
      bannerKind.set("offline");
      banner.set("offline");
      return;
    }
    // Connect before mutating local messages so the idle follow snapshot
    // cannot wipe the just-added user bubble / freeze a pending run.
    try {
      if (!sessionReady()) await connectSession();
    } catch (error) {
      showConnectError(error);
      return;
    }
    if (run) return;
    const user: User = { kind: "user", id: nextId(), text, image, file };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      const start: Msg[] = messages().length
        ? []
        : [{ kind: "date", id: nextId(), label: "Today" }];
      messages.set([...messages(), ...start, user]);
      draft.set("");
      attachment.set(null);
    });
    toEnd();
    await replyDsh(text);
  };

  const send = () => {
    const text = draft().trim();
    const a = attachment();
    if (!text && !a) return;
    void submit(text || "（附件）", a?.image, a?.file);
  };

  /** Attaches a photo from the system's picker: its bytes stay native, shown through a blob URL. */
  const choosePhoto = async () => {
    const [picked] = await Picker.pickImages({ maxDimension: 2048, quality: 0.85 });
    if (!picked) return;
    const { file } = picked;
    const size =
      file.size < 1024 * 1024
        ? `${Math.max(1, Math.round(file.size / 1024))} KB`
        : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
    attachment.set({ image: URL.createObjectURL(file), file: { name: file.name, size } });
  };

  const update = (id: string, change: (m: Assistant) => Assistant) =>
    messages.set(messages().map((m) => (m.id === id && m.kind === "assistant" ? change(m) : m)));

  const promptBefore = (id: string) => {
    const all = messages();
    for (let i = all.findIndex((m) => m.id === id) - 1; i >= 0; i--) {
      const m = all[i];
      if (m.kind === "user") return m.text;
    }
    return "";
  };
  const regenerate = (m: Assistant) => {
    if (run) return;
    const text = promptBefore(m.id);
    if (!text) return;
    following.set(true);
    void (async () => {
      try {
        if (!sessionReady()) await connectSession();
      } catch (error) {
        showConnectError(error, m.id);
        return;
      }
      await replyDsh(text, m.id);
    })();
  };
  const retry = (m: Assistant) => regenerate(m);
  const copy = (key: string, text: string) => {
    Clipboard.writeText(text);
    copied.set(key);
    setTimeout(() => copied() === key && copied.set(null), 1600);
  };

  // Motion, run natively when the state changes.
  const jump = createAnimatedValue(0);
  effect(() => void jump.spring(following() ? 0 : 1, motion.settle));
  const menuValue = createAnimatedValue(0);
  effect(() => void menuValue.spring(menu() ? 1 : 0, motion.settle));
  const bannerValue = createAnimatedValue(0);
  effect(() => void bannerValue.spring(banner() ? 1 : 0, motion.settle));

  const streaming = () => liveId() !== null;
  const canSend = () => !!draft().trim() || !!attachment();

  const userRow = (m: () => User) => (
    <View style={{ alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 8, gap: 8 }}>
      <If when={m().image}>
        <Photo src={m().image!} width={220} height={165} />
      </If>
      <If when={m().file}>
        <FileChip file={m().file!} />
      </If>
      <If when={m().text}>
        <View
          style={{
            maxWidth: "82%",
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 20,
            borderBottomRightRadius: 6,
            borderCurve: "continuous",
            // A message is read, not pressed: flat, a hairline around it.
            backgroundColor: colors.raised,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.text }}>{m().text}</Text>
        </View>
      </If>
      <If when={m().waiting}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Spinner size={12} tint={colors.warn} />
          <Text style={{ fontSize: 12, color: colors.muted }}>Waiting for a connection</Text>
        </View>
      </If>
    </View>
  );

  const assistantRow = (m: () => Assistant) => {
    const live = () => liveId() === m().id;
    const reasoning = () =>
      live() ? (liveReason() ? { text: liveReason(), open: true } : null) : (m().reasoning ?? null);
    const thinkingLabel = () => {
      if (live()) {
        const t = liveThinking();
        if (t && t.seconds === null)
          return `Thinking… ${Math.max(0, Math.floor((now() - t.start) / 1000))} s`;
        return `Thought for ${t?.seconds ?? 1} s`;
      }
      return `Thought for ${m().reasoning?.seconds ?? 1} s`;
    };
    const tools = () => (live() ? liveTools() : m().tools);
    const md = () => (live() ? liveMd() : m().md);
    const waitingForWords = () =>
      live() &&
      !liveMd() &&
      !liveTools().length &&
      !(liveThinking() && liveThinking()!.seconds === null);
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 26 }}>
          <Avatar />
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: colors.muted }}>
            {m().script.startsWith("local:") ? m().script.slice(6) : m().model}
          </Text>
          <If when={!live() && m().status === "stopped"}>
            <Badge label="Stopped" tone="warn" />
          </If>
        </View>
        <If when={reasoning()}>
          <View style={{ gap: 8 }}>
            <Press
              scale={0.98}
              onPress={() => {
                if (live()) return;
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                update(m().id, (x) => ({
                  ...x,
                  reasoning: x.reasoning && { ...x.reasoning, open: !x.reasoning.open },
                }));
              }}
              accessibilityLabel="Reasoning"
              accessibilityState={{ selected: !!reasoning()?.open }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  height: 32,
                  alignSelf: "flex-start",
                }}
              >
                <If
                  when={live() && liveThinking()?.seconds === null}
                  else={<Glyph name="brain" size={16} tint={colors.muted} />}
                >
                  <Spinner size={14} tint={colors.muted} />
                </If>
                <Text style={{ fontSize: 14, color: colors.muted, fontVariant: ["tabular-nums"] }}>
                  {thinkingLabel()}
                </Text>
                <View
                  style={{
                    transform: [{ rotate: reasoning()?.open ? "0deg" : "-90deg" }],
                    transitionProperty: "transform",
                    transitionDuration: 220,
                    transitionTimingFunction: "ease-out",
                  }}
                >
                  <Glyph name="caret-down" size={14} tint={colors.faint} />
                </View>
              </View>
            </Press>
            <If when={reasoning()?.open}>
              <View style={{ flexDirection: "row", gap: 12, paddingLeft: 7 }}>
                <View style={{ width: 2, borderRadius: 1, backgroundColor: colors.border }} />
                <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: colors.muted }}>
                  {reasoning()?.text}
                </Text>
              </View>
            </If>
          </View>
        </If>
        <Each of={tools()} key={(t) => t.id}>
          {(tool) => <ToolCard tool={tool()} />}
        </Each>
        <If when={waitingForWords()}>
          <View style={{ flexDirection: "row", height: 22, alignItems: "center" }}>
            <Caret />
          </View>
        </If>
        <Markdown md={md()} id={m().id} streaming={live()} caret={live() ? <Caret /> : undefined} />
        <If when={!live() && m().status === "error"}>
          <ErrorRow message={m().error ?? "Something went wrong."} onRetry={() => retry(m())} />
        </If>
        <If when={!live() && m().status === "stopped"}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Glyph name="stop" size={12} tint={colors.faint} />
            <Text style={{ fontSize: 13, color: colors.faint }}>You stopped this reply</Text>
          </View>
        </If>
        <If when={!live() && m().status !== "error"}>
          <View
            style={{ flexDirection: "row", alignItems: "center", marginLeft: -8, marginTop: -6 }}
          >
            <ActionButton
              glyph={copied() === m().id ? "check" : "copy"}
              label="Copy"
              active={copied() === m().id}
              tone="up"
              onPress={() => copy(m().id, m().md)}
            />
            <ActionButton glyph="regenerate" label="Regenerate" onPress={() => regenerate(m())} />
            <ActionButton
              glyph="thumb-up"
              label="Good reply"
              active={m().rating === "up"}
              onPress={() =>
                update(m().id, (x) => ({ ...x, rating: x.rating === "up" ? undefined : "up" }))
              }
            />
            <ActionButton
              glyph="thumb-down"
              label="Bad reply"
              active={m().rating === "down"}
              tone="danger"
              onPress={() =>
                update(m().id, (x) => ({ ...x, rating: x.rating === "down" ? undefined : "down" }))
              }
            />
          </View>
        </If>
      </View>
    );
  };

  const empty = (
    <View
      style={{
        ...column,
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 24,
        gap: 24,
      }}
    >
      <Appear>
        <View style={{ alignItems: "center", gap: 12 }}>
          <IconTile name="spark" tint={colors.accent} size={56} />
          <Text style={{ fontSize: 22, fontWeight: "600", color: colors.text }}>
            How can I help?
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: "center" }}>
            {native
              ? "Messages go to the official dsh Session through the local Host."
              : "Dialogue needs the desktop Client connected to Host / dsh."}
          </Text>
        </View>
      </Appear>
    </View>
  );

  const menuRows: { id: string; glyph: "clip"; label: string }[] = [
    { id: "photo", glyph: "clip", label: "Choose a photo" },
  ];

  const pane = (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, paddingBottom: "env(keyboard-inset-height)" }}>
        <View style={{ flex: 1 }}>
          <If when={messages().length} else={empty}>
            {/* One selection across messages: in the List, over the rows that are mounted. */}
            <View selectable style={{ flex: 1 }}>
              <List
                ref={list}
                each={messages()}
                keyExtractor={(m) => m.id}
                estimatedItemSize={140}
                initialScrollIndex={Math.max(0, messages().length - 1)}
                style={{ flex: 1 }}
                contentStyle={{ paddingTop: 8, paddingBottom: 16 }}
                keyboardDismissMode="interactive"
                maintainVisibleContentPosition={{ autoscrollToBottomThreshold: 40 }}
                scrollEventThrottle={100}
                onScrollDragStart={() => (dragging = true)}
                onScroll={(e) => {
                  if (dragging)
                    following.set(e.offset.y + e.size.height >= e.contentSize.height - 40);
                }}
                onMomentumEnd={() => (dragging = false)}
                onScrollEnd={() => (dragging = false)}
              >
                {(item) => {
                  const kind = computed(() => item().kind);
                  return (
                    <View style={column}>
                      {(() => {
                        switch (kind()) {
                          case "date":
                            return (
                              <DateSeparator
                                label={(item() as Extract<Msg, { kind: "date" }>).label}
                              />
                            );
                          case "user":
                            return userRow(item as () => User);
                          case "assistant":
                            return assistantRow(item as () => Assistant);
                        }
                      })()}
                    </View>
                  );
                }}
              </List>
            </View>
          </If>

          {/* Jump to the latest message: shown while scrolled up. */}
          <View
            style={{
              pointerEvents: following() ? "none" : "auto",
              position: "absolute",
              right: 16,
              bottom: 12,
              opacity: jump,
              transform: [
                { scale: jump.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              ],
            }}
          >
            <RoundButton
              icon="arrow-down"
              label="Jump to the latest message"
              variant="secondary"
              onPress={jumpToLatest}
            />
            <If when={streaming()}>
              <View
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.accent,
                  borderWidth: 2,
                  borderColor: colors.background,
                }}
              />
            </If>
          </View>

          {/* Connection banner. */}
          <View
            style={{
              pointerEvents: "none",
              position: "absolute",
              top: 8,
              left: 16,
              right: 16,
              opacity: bannerValue,
              transform: [
                {
                  translateY: bannerValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-64, 0],
                  }),
                },
              ],
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 48,
                paddingHorizontal: 14,
                borderRadius: radius.inset,
                borderCurve: "continuous",
                ...finish.menu,
                borderWidth: 1,
                borderColor: alpha(bannerKind() === "offline" ? colors.warn : colors.up, 0.35),
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: toneTint(bannerKind() === "offline" ? "warn" : "up"),
                }}
              >
                <Glyph
                  name={bannerKind() === "offline" ? "offline" : "check"}
                  size={15}
                  tint={bannerKind() === "offline" ? colors.warn : colors.up}
                />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                  {bannerKind() === "offline" ? "You're offline" : "Back online"}
                </Text>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {bannerKind() === "offline"
                    ? "Your message sends when the connection returns."
                    : "Sending your message."}
                </Text>
              </View>
            </View>
          </View>

          {/* The "+" menu: attachments. */}
          <View
            onPress={() => menu.set(false)}
            style={{
              pointerEvents: menu() ? "auto" : "none",
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              opacity: menuValue,
            }}
          />
          <View
            style={{
              pointerEvents: menu() ? "auto" : "none",
              position: "absolute",
              left: 16,
              right: 16,
              bottom: 8,
              opacity: menuValue,
              transform: [
                { translateY: menuValue.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                { scale: menuValue.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
              ],
            }}
          >
            <View
              style={{
                borderRadius: radius.card,
                borderCurve: "continuous",
                ...finish.menu,
                borderWidth: 1,
                paddingVertical: 6,
                maxHeight: 460,
                overflow: "hidden",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.faint,
                  paddingHorizontal: 16,
                  paddingTop: 8,
                  paddingBottom: 4,
                }}
              >
                ADD
              </Text>
              <Scroll style={{ flexShrink: 1 }}>
                <Each of={menuRows}>
                  {(row) => (
                    <View
                      onPress={() => {
                        menu.set(false);
                        if (row().id === "photo") void choosePhoto();
                      }}
                      activeStyle={{ backgroundColor: alpha(colors.text, 0.06) }}
                      role="button"
                      accessibilityLabel={row().label}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        height: 48,
                        paddingHorizontal: 16,
                      }}
                    >
                      <Glyph name={row().glyph} size={16} tint={colors.accent} />
                      <Text style={{ flex: 1, fontSize: 15, color: colors.text }}>
                        {row().label}
                      </Text>
                    </View>
                  )}
                </Each>
              </Scroll>
            </View>
          </View>
        </View>

        {/* The composer. */}
        <View
          style={{
            ...column,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 8 + (keyboardFrame().height > 0 ? 0 : insets().bottom),
            gap: 8,
          }}
        >
          <If when={attachment()}>
            <Appear>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Photo src={attachment()!.image} width={48} height={48} />
                <View style={{ flex: 1 }}>
                  <FileChip file={attachment()!.file} onRemove={() => attachment.set(null)} />
                </View>
              </View>
            </Appear>
          </If>
          <View
            style={{
              borderRadius: 24,
              borderCurve: "continuous",
              // Glass like the menu above it, without the blur: nothing scrolls under it.
              ...finish.menu,
              backdropFilter: undefined,
              borderWidth: 1,
              padding: 6,
              gap: 4,
            }}
          >
            <Input
              value={draft()}
              onChange={(e) => draft.set(e.value)}
              multiline
              // Return sends on desktops, as in chat apps there (Shift+Return
              // adds a line); phones keep return for line breaks.
              submitBehavior={platform.idiom === "desktop" ? "submit" : "newline"}
              onSubmit={() => {
                if (!streaming()) send();
              }}
              placeholder="Message Session"
              onFocus={() => menu.set(false)}
              onContentSizeChange={(e) =>
                inputHeight.set(Math.min(100, Math.max(20, e.size.height)))
              }
              style={{
                placeholderColor: colors.faint,
                selectionColor: colors.accent,
                height: inputHeight() + 20,
                fontSize: 15,
                lineHeight: 20,
                color: colors.text,
                paddingHorizontal: 10,
                paddingVertical: 10,
              }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View
                style={{
                  transform: [{ rotate: menu() ? "45deg" : "0deg" }],
                  transitionProperty: "transform",
                  transitionDuration: 200,
                  transitionTimingFunction: "ease-out",
                }}
              >
                <RoundButton
                  icon="plus"
                  label="Add"
                  variant="secondary"
                  onPress={() => menu.set(!menu())}
                />
              </View>
              <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  {sessionReady()
                    ? "Session connected"
                    : sessionError()
                      ? "Context 中启动 Host / 后台"
                      : "Open Context to connect"}
                </Text>
              </View>
              <If
                when={streaming()}
                else={
                  <View
                    style={{
                      pointerEvents: canSend() ? "auto" : "none",
                      opacity: canSend() ? 1 : 0.35,
                    }}
                  >
                    <RoundButton icon="arrow-up" label="Send" onPress={send} />
                  </View>
                }
              >
                <Press onPress={stop} scale={0.9} accessibilityLabel="Stop generating">
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.light,
                      ...finish.light,
                    }}
                  >
                    <Glyph name="stop" size={16} tint={colors.onLight} />
                  </View>
                </Press>
              </If>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
  // Clear local projection when selection / epoch changes.
  effect(() => {
    props.selectedId;
    chatEpoch();
    stop();
    batch(() => {
      messages.set([]);
      attachment.set(null);
      menu.set(false);
      draft.set("");
    });
  });

  return pane;
}
