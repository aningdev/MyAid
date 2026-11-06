import type { ImageMediaType, PromptContentPart } from "@myaid/dsh-web-protocol/session";
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
import { type FileRef, type Msg, type Tool } from "./chat/scripts";
import {
  acknowledgeTurnFreeze,
  applyTurnError,
  beginLocalTurn,
  cancelLocalTurn,
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
 * Dialogue main pane — renders TurnProjection; does not own freeze / frame policy.
 */
export function ChatPane(props: { selectedId: string | null }) {
  const wide = platform.idiom === "desktop";
  /** Desktop: messages and the composer in a centered column. */
  const column: ViewStyle = wide ? { width: "100%", maxWidth: 820, alignSelf: "center" } : {};
  const insets = safeAreaInsets();
  let ids = 0;
  const nextId = () => `m${ids++}`;

  const messages = signal<Msg[]>([]);
  const model = chatModel;
  const native = platform.idiom === "desktop" && platform.os !== "web";
  const useDsh = () => native && !!props.selectedId;
  const draft = signal("");
  const inputHeight = signal(20);
  const attachment = signal<{
    image: string;
    file: FileRef;
    blob: Blob;
    mediaType: ImageMediaType;
  } | null>(null);
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
  /** True while TurnProjection owns an in-flight local prompt. */
  const prompting = signal(false);

  /** Whether the user is at the bottom (the list then follows the stream
   * natively, `maintainVisibleContentPosition`); scrolling up clears it. */
  const following = signal(true);
  let list: ListRef | undefined;
  let dragging = false;

  let thinkStart = 0;
  let thinkSeconds: number | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;

  // Absolute live strings collect here and reach the signals once per frame.
  let pendingMd: string | null = null;
  let pendingReason: string | null = null;
  let frameQueued = false;

  /** Scrolls to the end on the user's own action (send, jump, load). */
  const toEnd = (animated = true) => {
    following.set(true);
    list?.scrollToEnd({ animated });
  };

  const stopTicker = () => {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
  };

  const flushLive = () => {
    frameQueued = false;
    batch(() => {
      if (pendingReason !== null) {
        liveReason.set(pendingReason);
        pendingReason = null;
      }
      if (pendingMd !== null) {
        liveMd.set(pendingMd);
        pendingMd = null;
      }
    });
  };

  const queueLive = () => {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(flushLive);
  };

  const clearLiveSignals = () => {
    pendingMd = pendingReason = null;
    frameQueued = false;
    liveReason.set("");
    liveThinking.set(null);
    liveTools.set([]);
    liveMd.set("");
  };

  const noteReasoning = (reason: string) => {
    if (!reason) return;
    if (!liveThinking()) {
      const start = thinkStart || performance.now();
      thinkStart = start;
      now.set(start);
      liveThinking.set({ start, seconds: null });
      stopTicker();
      ticker = setInterval(() => now.set(performance.now()), 1000);
    }
  };

  const noteReasoningDone = () => {
    const thinking = liveThinking();
    if (!thinking || thinking.seconds !== null) return;
    const seconds = Math.max(1, Math.round((performance.now() - thinking.start) / 1000));
    thinkSeconds = seconds;
    stopTicker();
    liveThinking.set({ start: thinking.start, seconds });
  };

  const commitProjected = (projected: Msg[]) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      messages.set([{ kind: "date", id: nextId(), label: "Today" }, ...projected]);
      liveId.set(null);
      clearLiveSignals();
      prompting.set(false);
    });
    acknowledgeTurnFreeze();
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
      clearLiveSignals();
      prompting.set(false);
    });
    // Host / backend setup lives in Context — open it when connect fails.
    if (/宿主|后台未|MYAID_DSH/.test(msg)) openContext();
  };

  /** Start a Session reply; `at` replaces that assistant bubble (retry / regenerate). */
  const replyDsh = async (text: string, at?: string, content?: readonly PromptContentPart[]) => {
    if (prompting()) return;
    const id = at ?? nextId();
    thinkStart = performance.now();
    thinkSeconds = null;
    const placeholder: Assistant = {
      kind: "assistant",
      id,
      model: model(),
      script: "dsh",
      tools: [],
      md: "",
      status: "done",
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      clearLiveSignals();
      prompting.set(true);
      liveId.set(id);
      messages.set(
        at ? messages().map((m) => (m.id === at ? placeholder : m)) : [...messages(), placeholder],
      );
    });
    beginLocalTurn(id);
    try {
      const sessionId = props.selectedId;
      if (!sessionId) throw new Error("先选择一条会话。");
      await promptSession(text, sessionId, content);
    } catch (error) {
      applyTurnError(error instanceof Error ? error.message : String(error));
    }
  };

  const stop = () => {
    if (!prompting()) return;
    if (useDsh()) void cancelSession();
    cancelLocalTurn();
  };

  // Project official Session follow frames into the primary pane.
  effect(() => {
    if (!useDsh()) return;
    const stopSub = subscribeSession((view) => {
      const busy = !!(view.liveMd || view.liveReason || view.liveTools.length);

      if (view.pendingFreeze) {
        flushLive();
        stopTicker();
        const freeze = view.pendingFreeze;
        if (freeze.messages.length) {
          commitProjected(freeze.messages);
        } else {
          const seconds =
            thinkSeconds ??
            (view.liveReason || liveReason()
              ? Math.max(1, Math.round((performance.now() - thinkStart) / 1000))
              : 1);
          const id = liveId() ?? nextId();
          const final: Assistant = {
            kind: "assistant",
            id,
            model: model(),
            script: "dsh",
            reasoning:
              view.liveReason || liveReason()
                ? { text: view.liveReason || liveReason(), seconds, open: false }
                : undefined,
            tools: (view.liveTools.length ? view.liveTools : liveTools()).map((t) =>
              t.state === "done" ? t : ({ ...t, state: "cancelled" } as Tool),
            ),
            md: view.liveMd || liveMd(),
            status: freeze.status,
            error: freeze.error,
          };
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          batch(() => {
            messages.set(messages().map((m) => (m.id === id ? final : m)));
            liveId.set(null);
            clearLiveSignals();
            prompting.set(false);
          });
          acknowledgeTurnFreeze();
          setTimeout(() => following() && list?.scrollToEnd({ animated: true }), 360);
        }
        return;
      }

      if (!prompting()) {
        if (!view.messages.length && !busy) return;
        const projected: Msg[] = [{ kind: "date", id: nextId(), label: "Today" }, ...view.messages];
        if (view.running && busy) {
          const live: Assistant = {
            kind: "assistant",
            id: view.liveId ?? `live-${Date.now()}`,
            model: model(),
            script: "dsh",
            reasoning: view.liveReason
              ? { text: view.liveReason, seconds: 1, open: true }
              : undefined,
            tools: view.liveTools,
            md: view.liveMd,
            status: "done",
          };
          batch(() => {
            messages.set([...projected, live]);
            liveId.set(live.id);
            liveMd.set(view.liveMd);
            liveReason.set(view.liveReason);
            liveTools.set(view.liveTools);
          });
        } else {
          batch(() => {
            messages.set(projected);
            liveId.set(null);
            clearLiveSignals();
          });
        }
        return;
      }

      if (view.liveTools.length) liveTools.set(view.liveTools);
      if (view.liveReason) {
        pendingReason = view.liveReason;
        noteReasoning(view.liveReason);
        queueLive();
      }
      if (view.liveMd) {
        if (view.liveReason || liveReason()) noteReasoningDone();
        pendingMd = view.liveMd;
        queueLive();
      }
    });
    cleanup(stopSub);
  });

  effect(() => {
    const id = props.selectedId;
    chatEpoch();
    if (!useDsh() || !id) return;
    resetLocalProjection();
    stopTicker();
    messages.set([]);
    liveId.set(null);
    clearLiveSignals();
    prompting.set(false);
    void openSession(id).catch(() => undefined);
  });

  cleanup(stopTicker);

  effect(() => {
    const err = sessionError();
    if (useDsh() && err && prompting()) {
      applyTurnError(err);
    }
  });

  const jumpToLatest = () => {
    toEnd();
  };

  /** Sends the user's message into the official Session (text + optional image part). */
  const submit = async (
    text: string,
    image?: string,
    file?: FileRef,
    pending?: { blob: Blob; mediaType: ImageMediaType; name?: string },
  ) => {
    if (prompting()) return;
    menu.set(false);
    following.set(true);
    if (!native) {
      bannerKind.set("offline");
      banner.set("offline");
      return;
    }
    // Connect before mutating local messages so the idle follow snapshot
    // cannot wipe the just-added user bubble / freeze a pending run.
    if (!props.selectedId) {
      showConnectError(new Error("先选择一条会话。"));
      return;
    }
    try {
      if (!sessionReady()) await connectSession(props.selectedId);
    } catch (error) {
      showConnectError(error);
      return;
    }
    if (prompting()) return;
    let content: PromptContentPart[] | undefined;
    if (pending) {
      try {
        content = await buildPromptContent(text, pending);
      } catch (error) {
        showConnectError(error);
        return;
      }
    }
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
    await replyDsh(text, undefined, content);
  };

  const send = () => {
    const text = draft().trim();
    const a = attachment();
    if (!text && !a) return;
    void submit(
      text || "（附件）",
      a?.image,
      a?.file,
      a ? { blob: a.blob, mediaType: a.mediaType, name: a.file.name } : undefined,
    );
  };

  /** Attaches a photo from the system's picker: its bytes stay native, shown through a blob URL. */
  const choosePhoto = async () => {
    const [picked] = await Picker.pickImages({ maxDimension: 2048, quality: 0.85 });
    if (!picked) return;
    const { file } = picked;
    const mediaType = asImageMediaType(file.type);
    if (!mediaType) {
      showConnectError(new Error("仅支持 PNG / JPEG / WebP / GIF 图片。"));
      return;
    }
    const size =
      file.size < 1024 * 1024
        ? `${Math.max(1, Math.round(file.size / 1024))} KB`
        : `${(file.size / 1024 / 1024).toFixed(1)} MB`;
    attachment.set({
      image: URL.createObjectURL(file),
      file: { name: file.name, size },
      blob: file,
      mediaType,
    });
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
    if (prompting()) return;
    const text = promptBefore(m.id);
    if (!text) return;
    following.set(true);
    void (async () => {
      if (!props.selectedId) {
        showConnectError(new Error("先选择一条会话。"), m.id);
        return;
      }
      try {
        if (!sessionReady()) await connectSession(props.selectedId);
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
          <Text style={{ userSelect: "text", fontSize: 15, lineHeight: 21, color: colors.text }}>
            {m().text}
          </Text>
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
                <Text
                  style={{
                    userSelect: "text",
                    flex: 1,
                    fontSize: 14,
                    lineHeight: 20,
                    color: colors.muted,
                  }}
                >
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
                caretColor: colors.accent,
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

const IMAGE_MEDIA_TYPES = new Set<ImageMediaType>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function asImageMediaType(value: string): ImageMediaType | null {
  return IMAGE_MEDIA_TYPES.has(value as ImageMediaType) ? (value as ImageMediaType) : null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function buildPromptContent(
  text: string,
  pending: { blob: Blob; mediaType: ImageMediaType; name?: string },
): Promise<PromptContentPart[]> {
  const parts: PromptContentPart[] = [];
  if (text.trim()) parts.push({ type: "text", text });
  parts.push({
    type: "image",
    mediaType: pending.mediaType,
    data: await blobToBase64(pending.blob),
    ...(pending.name ? { name: pending.name } : {}),
  });
  return parts;
}
