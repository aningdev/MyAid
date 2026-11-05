import {
  computed,
  effect,
  List,
  reduceMotion,
  Scroll,
  signal,
  Text,
  untracked,
  View,
  type ListRef,
  type ViewStyle,
} from "nsh";
import { createAnimatedValue, LayoutAnimation } from "nsh";
import { platform } from "nsh";
import { keyboardFrame, safeAreaInsets } from "nsh";
import { Input, Menu, MenuItem } from "nsh/base";

import { Icon, type IconName } from "../../components/ui";
import {
  alpha,
  Appear,
  Badge,
  colors,
  finish,
  focusRing,
  IconTile,
  motion,
  Press,
  radius,
  RoundButton,
  toneTint,
} from "../../components/ui";
import { Glyph } from "./chat/glyphs";
import { Markdown } from "./chat/markdown";
import { createChatSession } from "./chat/session";
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
import { type Msg, photo, scenarios } from "./chat/scripts";
import { chatEpoch, model as chatModel, provider as chatProvider, setModel } from "./state";

type Assistant = Extract<Msg, { kind: "assistant" }>;
type User = Extract<Msg, { kind: "user" }>;

const models = [
  { value: "Swift", label: "Swift" },
  { value: "Deep", label: "Deep" },
  { value: "Vision", label: "Vision" },
] as const;

const providers = [
  { value: "Claude", label: "Claude" },
  { value: "Codex", label: "Codex" },
] as const;

const featured: { id: string; icon: IconName; note: string }[] = [
  { id: "guide", icon: "text", note: "Markdown, a table, code" },
  { id: "reason", icon: "spark", note: "Reasoning first" },
  { id: "search", icon: "search", note: "A tool call" },
  { id: "vision", icon: "image", note: "A photo and a file" },
];

export function ChatPane(props: { selectedId: string | null }) {
  const column: ViewStyle = { width: "100%", maxWidth: 820, alignSelf: "center" };
  const insets = safeAreaInsets();
  const native = platform.idiom === "desktop" && platform.os !== "web";
  let list: ListRef | undefined;
  let dragging = false;
  const following = signal(true);
  const jumpToLatest = () => {
    following.set(true);
    list?.scrollToEnd({ animated: true });
  };
  const menu = signal(false);
  const session = createChatSession({
    native,
    model: chatModel,
    provider: chatProvider,
    setModel,
    scrollToEnd(animated) {
      following.set(true);
      list?.scrollToEnd({ animated });
    },
    followIfPinned() {
      if (following()) list?.scrollToEnd({ animated: true });
    },
    closeMenu() {
      menu.set(false);
    },
  });
  const {
    messages,
    draft,
    inputHeight,
    attachment,
    banner,
    bannerKind,
    copied,
    liveId,
    liveReason,
    liveThinking,
    liveTools,
    liveMd,
    now,
    streaming,
    canSend,
    stop,
    send,
    choosePhoto,
    play,
    update,
    regenerate,
    retry,
    copy,
    clearTranscript,
  } = session;

    // Motion, run natively when the state changes.
  const jump = createAnimatedValue(0);
  effect(() => {
    const next = following() ? 0 : 1;
    if (reduceMotion()) jump.set(next);
    else jump.spring(next, motion.settle);
  });
  const bannerValue = createAnimatedValue(0);
  effect(() => {
    const next = banner() ? 1 : 0;
    if (reduceMotion()) bannerValue.set(next);
    else bannerValue.spring(next, motion.settle);
  });

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
          <Text class="text-base text-foreground">{m().text}</Text>
        </View>
      </If>
      <If when={m().waiting}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Spinner size={12} tint={colors.warn} />
          <Text class="text-xs text-muted-foreground">Waiting for a connection</Text>
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
          <Text class="text-sm font-semibold text-muted-foreground" style={{ flex: 1 }}>
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
                <Text class="text-sm text-muted-foreground" style={{ fontVariant: ["tabular-nums"] }}>
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
                <Text class="text-sm text-muted-foreground" style={{ flex: 1 }}>
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
            <Text class="text-sm text-faint">You stopped this reply</Text>
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
          <Text class="text-xl font-semibold text-foreground">
            How can I help?
          </Text>
          <Text class="text-base text-center text-muted-foreground">
            {native
              ? "Chat with your local Claude or Codex CLI. Sign in to the CLI in a terminal first."
              : "A simulated assistant: every reply is scripted and streamed locally."}
          </Text>
        </View>
      </Appear>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Each of={featured}>
          {(f, i) => {
            const s = scenarios.find((x) => x.id === f().id)!;
            return (
              <View style={{ width: "47%", flexGrow: 1 }}>
                <Appear index={i() + 1}>
                  <Press onPress={() => play(s.id)} accessibilityLabel={s.chip}>
                    <View
                      style={{
                        minHeight: 104,
                        padding: 12,
                        gap: 8,
                        borderRadius: radius.inset,
                        borderCurve: "continuous",
                        backgroundColor: colors.surface,
                        ...finish.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Icon name={f().icon} size={18} tint={colors.accent} />
                      <Text class="text-sm font-semibold text-foreground">
                        {s.chip}
                      </Text>
                      <Text class="text-xs text-muted-foreground">{f().note}</Text>
                    </View>
                  </Press>
                </Appear>
              </View>
            );
          }}
        </Each>
      </View>
    </View>
  );

  const chips = [
    ...scenarios.map((s) => ({ id: s.id, label: s.chip })),
    { id: "history", label: "Load a long conversation" },
  ];

  const menuRows: { id: string; glyph: "clip" | "regenerate"; label: string }[] = [
    { id: "photo", glyph: "clip", label: "Choose a photo" },
    { id: "attach", glyph: "clip", label: "Attach a photo and a file" },
    ...chips.map((c) => ({ id: c.id, glyph: "regenerate" as const, label: c.label })),
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
                <Text class="text-sm font-semibold text-foreground">
                  {bannerKind() === "offline" ? "You're offline" : "Back online"}
                </Text>
                <Text class="text-sm text-muted-foreground">
                  {bannerKind() === "offline"
                    ? "Your message sends when the connection returns."
                    : "Sending your message."}
                </Text>
              </View>
            </View>
          </View>

        </View>

        {/* Suggestions while the conversation is empty. */}
        <If when={!messages().length}>
          <Scroll
            horizontal
            scrollbar={false}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0 }}
          >
            <View
              style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}
            >
              <Each of={chips}>
                {(chip) => (
                  <Press
                    onPress={() => play(chip().id)}
                    hitSlop={4}
                    accessibilityLabel={chip().label}
                  >
                    <View
                      style={{
                        height: 36,
                        paddingHorizontal: 14,
                        borderRadius: 18,
                        justifyContent: "center",
                        ...finish.pill,
                        borderWidth: 1,
                      }}
                    >
                      <Text class="text-sm font-medium text-foreground">
                        {chip().label}
                      </Text>
                    </View>
                  </Press>
                )}
              </Each>
            </View>
          </Scroll>
        </If>

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
              placeholder={`Message ${native ? chatProvider() : chatModel()}`}
              onFocus={() => menu.set(false)}
              onContentSizeChange={(e) =>
                inputHeight.set(Math.min(100, Math.max(20, e.size.height)))
              }
              class="text-base text-foreground px-2.5 py-2.5"
              style={{
                placeholderColor: colors.faint,
                selectionColor: colors.accent,
                height: inputHeight() + 20,
              }}
            />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Menu
                open={menu()}
                onOpenChange={(event) => menu.set(event.open)}
                placement="top"
                align="start"
                offset={8}
                popupClass="border-border bg-popover max-h-96 min-w-64 overflow-hidden rounded-(--radius) border p-1"
                backdropClass="bg-overlay"
                trigger={
                  <View
                    accessibilityLabel="Add"
                    focusStyle={focusRing()}
                    class="border-border bg-secondary size-11 items-center justify-center rounded-full border"
                    style={{
                      transform: [{ rotate: menu() ? "45deg" : "0deg" }],
                      transitionProperty: "transform",
                      transitionDuration: reduceMotion() ? 0 : 200,
                    }}
                  >
                    <Icon name="plus" size={18} tint={colors.text} />
                  </View>
                }
              >
                <Text class="text-muted-foreground px-3 pb-1 pt-2 text-xs font-medium">
                  Add and replay
                </Text>
                <Scroll class="max-h-80">
                  <Each of={menuRows} key={(row) => row.id}>
                    {(row, i) => (
                      <MenuItem
                        class="hover:bg-accent active:bg-accent min-h-11 rounded-(--radius) px-3"
                        accessibilityLabel={row().label}
                        onSelect={() => {
                          if (row().id === "photo") void choosePhoto();
                          else if (row().id === "attach")
                            attachment.set({
                              image: photo,
                              file: { name: "trip-notes.pdf", size: "2.4 MB" },
                            });
                          else play(row().id);
                        }}
                      >
                        <View class="flex-row items-center gap-3">
                          <Glyph
                            name={row().glyph}
                            size={16}
                            tint={i() < 2 ? colors.accent : colors.muted}
                          />
                          <Text class="text-popover-foreground text-base">{row().label}</Text>
                        </View>
                      </MenuItem>
                    )}
                  </Each>
                </Scroll>
              </Menu>
              <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 8 }}>
                <Text class="text-xs text-muted-foreground">
                  {native ? chatProvider() : chatModel()} · open Context to change
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
  // Drive session from List / stack selection.
  // play→submit reads/writes `messages`; must not track those or this effect loops.
  effect(() => {
    const id = props.selectedId;
    // Track New-chat bumps so re-clicking New while already empty still resets.
    // The reset writes messages; reading them here would rerun this effect.
    chatEpoch();
    untracked(() => {
      menu.set(false);
      clearTranscript();
      if (!id || id === "new") return;
      play(id);
    });
  });

  return pane;
}
