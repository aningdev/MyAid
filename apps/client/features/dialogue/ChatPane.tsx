/**
 * A Session's chat: the header, the transcript, the approval waiting on the
 * person and the composer. Everything durable comes from the SessionController
 * (`TurnProjection` is the only frame → UI projector); this Pane owns what the
 * screen alone knows — the expansion of tool rows, the follow state, the
 * working row's clock — and the send / stop / retry actions.
 */
import type { PromptContentPart } from "@myaid/dsh-web-protocol/session";
import {
  batch,
  Clipboard,
  cleanup,
  effect,
  type ListRef,
  platform,
  signal,
  Text,
  untracked,
  View,
} from "nsh";
import { LayoutAnimation } from "nsh";

import { alpha, Appear, colors, IconTile, Press, radius } from "../../components/ui";
import { claimOwner } from "../bots/model";
import { registry } from "../bots/state";
import { ApprovalCard } from "./chat/ApprovalCard";
import { ChatHeader } from "./chat/ChatHeader";
import { Composer } from "./chat/Composer";
import { blobToBase64, filesFromUrls } from "./chat/files";
import { type RowHandlers } from "./chat/MessageRow";
import { buildRows, toggleKey } from "./chat/rows";
import type { Msg, Tool } from "./chat/scripts";
import { Transcript } from "./chat/Transcript";
import type { SessionController } from "./session/controller";
import {
  connectSession,
  modelCatalog,
  renameSession,
  selectSessionModel,
  sessionError,
  sessionList,
} from "./session/runtime";
import { catalogModelKey } from "./state";

type Assistant = Extract<Msg, { kind: "assistant" }>;

/**
 * Dialogue main pane — renders one SessionController's TurnProjection; the
 * controller owns frames, turn freeze, approvals, the draft and its files.
 */
export function ChatPane(props: { controller: SessionController }) {
  const controller = () => props.controller;
  const native = platform.idiom === "desktop" && platform.os !== "web";
  const owner = () => claimOwner(registry(), props.controller.sessionId);
  const botName = () => owner()?.bot.name ?? "Bot";
  const title = () => {
    const row = sessionList().find((item) => item.id === props.controller.sessionId);
    return row?.label ?? owner()?.claim.title ?? "New Session";
  };
  const subtitle = () => owner()?.dialogue.workspacePath ?? "";

  let ids = 0;
  const nextId = () => `m${ids++}`;

  const messages = signal<Msg[]>([]);
  const liveId = signal<string | null>(null);
  const liveReason = signal("");
  const liveThinking = signal<{ start: number; seconds: number | null } | null>(null);
  const liveTools = signal<Tool[]>([]);
  const liveMd = signal("");
  const now = signal(Date.now());
  /** True while TurnProjection owns an in-flight local prompt. */
  const prompting = signal(false);
  /** When the running turn began, for the working row's clock. */
  const since = signal<number | null>(null);
  /** The list follows the newest message until the person scrolls up. */
  const following = signal(true);
  const scrolled = signal(false);
  /** Which tool rows, step groups and reasoning rows are open. */
  const expanded = signal<ReadonlySet<string>>(new Set());
  const copied = signal<string | null>(null);
  /** A file drag is over the chat; a drop reads its files. */
  const dragging = signal(false);
  const dropTrouble = signal<string | null>(null);

  let list: ListRef | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;

  // Absolute live strings collect here and reach the signals once per frame.
  let pendingMd: string | null = null;
  let pendingReason: string | null = null;
  let frameQueued = false;

  let thinkStart = 0;
  let thinkSeconds: number | null = null;

  const running = () => controller().running() || liveId() !== null;

  const startTicker = () => {
    if (ticker !== undefined) return;
    now.set(Date.now());
    ticker = setInterval(() => now.set(Date.now()), 1000);
  };
  const stopTicker = () => {
    if (ticker !== undefined) clearInterval(ticker);
    ticker = undefined;
  };

  /** Scrolls to the end on the person's own action (send, jump). */
  const toEnd = (animated = true) => {
    following.set(true);
    list?.scrollToEnd({ animated });
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
      const start = thinkStart || Date.now();
      thinkStart = start;
      liveThinking.set({ start, seconds: null });
      startTicker();
    }
  };

  const noteReasoningDone = () => {
    const thinking = liveThinking();
    if (!thinking || thinking.seconds !== null) return;
    const seconds = Math.max(1, Math.round((Date.now() - thinking.start) / 1000));
    thinkSeconds = seconds;
    liveThinking.set({ start: thinking.start, seconds });
  };

  /** The reply being written, frozen as the turn ended (stopped, failed). */
  const freezeFinal = (
    id: string,
    status: "done" | "stopped" | "error",
    error?: string,
  ): Assistant | null => {
    const thinking = liveThinking();
    return {
      kind: "assistant",
      id,
      at: Date.now(),
      model: "Deep",
      script: "dsh",
      reasoning: liveReason()
        ? { text: liveReason(), seconds: thinking?.seconds ?? 1, open: false }
        : undefined,
      tools: liveTools().map((tool) =>
        tool.state === "done" ? tool : ({ ...tool, state: "cancelled" } as Tool),
      ),
      md: liveMd(),
      status,
      error,
    };
  };

  const commitProjected = (projected: Msg[]) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      messages.set(projected);
      liveId.set(null);
      clearLiveSignals();
      prompting.set(false);
      since.set(null);
    });
    stopTicker();
    controller().acknowledgeFreeze();
    setTimeout(() => following() && list?.scrollToEnd({ animated: true }), 360);
  };

  const showConnectError = (error: unknown, at?: string) => {
    const message = error instanceof Error ? error.message : String(error);
    const failId = at ?? nextId();
    const failed: Assistant = {
      kind: "assistant",
      id: failId,
      at: Date.now(),
      model: "Deep",
      script: "dsh",
      tools: [],
      md: "",
      status: "error",
      error: message,
    };
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      messages.set(
        at ? messages().map((item) => (item.id === at ? failed : item)) : [...messages(), failed],
      );
      liveId.set(null);
      clearLiveSignals();
      prompting.set(false);
      since.set(null);
    });
    stopTicker();
  };

  /** Start a Session reply; `at` replaces that assistant bubble (retry / regenerate). */
  const replyDsh = async (text: string, at?: string, content?: readonly PromptContentPart[]) => {
    if (prompting()) return;
    const id = at ?? nextId();
    thinkStart = Date.now();
    thinkSeconds = null;
    const placeholder: Assistant = {
      kind: "assistant",
      id,
      at: Date.now(),
      model: "Deep",
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
      since.set(Date.now());
      messages.set(
        at
          ? messages().map((item) => (item.id === at ? placeholder : item))
          : [...messages(), placeholder],
      );
    });
    startTicker();
    controller().beginLocalTurn(id);
    try {
      await controller().prompt(text, content);
    } catch (error) {
      controller().applyError(error instanceof Error ? error.message : String(error));
    }
  };

  // A different Session (or a reset) starts from nothing.
  effect(() => {
    const current = controller();
    current.sessionId;
    stopTicker();
    messages.set([]);
    liveId.set(null);
    clearLiveSignals();
    prompting.set(false);
    since.set(null);
    following.set(true);
  });

  // Follow the Session while a Panel shows it.
  effect(() => {
    if (!native) return;
    const current = controller();
    current.mount();
    cleanup(() => current.unmount());
  });

  // Project this controller's frames into the pane. Only the view is tracked:
  // what the effect writes (messages, the live signals) it also reads, and a
  // tracked read of those would ring the loop guard.
  effect(() => {
    const view = controller().view();
    untracked(() => projectView(view));
  });

  const projectView = (view: ReturnType<SessionController["view"]>) => {
    const busy = !!(view.liveMd || view.liveReason || view.liveTools.length);

    if (view.pendingFreeze) {
      flushLive();
      const freeze = view.pendingFreeze;
      // The view may have lost the local id (the turn's end lands first): the
      // Pane's own signals still hold what was written.
      const liveFinal =
        freeze.status === "error"
          ? null
          : freezeFinal(view.liveId ?? liveId() ?? lastAssistantId(), freeze.status, freeze.error);
      if (freeze.messages.length) {
        // A stopped reply keeps the words it had shown: the durable page knows
        // only the user's message, so the live bubble comes after it.
        commitProjected(liveFinal ? [...freeze.messages, liveFinal] : freeze.messages);
      } else {
        const seconds =
          thinkSeconds ??
          (view.liveReason || liveReason()
            ? Math.max(1, Math.round((Date.now() - thinkStart) / 1000))
            : 1);
        const id = liveId() ?? nextId();
        const final: Assistant = {
          kind: "assistant",
          id,
          at: Date.now(),
          model: "Deep",
          script: "dsh",
          reasoning:
            view.liveReason || liveReason()
              ? { text: view.liveReason || liveReason(), seconds, open: false }
              : undefined,
          tools: (view.liveTools.length ? view.liveTools : liveTools()).map((tool) =>
            tool.state === "done" ? tool : ({ ...tool, state: "cancelled" } as Tool),
          ),
          md: view.liveMd || liveMd(),
          status: freeze.status,
          error: freeze.error,
        };
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        batch(() => {
          messages.set(messages().map((item) => (item.id === id ? final : item)));
          liveId.set(null);
          clearLiveSignals();
          prompting.set(false);
          since.set(null);
        });
        stopTicker();
        controller().acknowledgeFreeze();
        setTimeout(() => following() && list?.scrollToEnd({ animated: true }), 360);
      }
      return;
    }

    if (!prompting()) {
      if (!view.messages.length && !busy) return;
      if (view.running && busy && !frozenTail()) {
        const live: Assistant = {
          kind: "assistant",
          id: view.liveId ?? `live-${Date.now()}`,
          at: Date.now(),
          model: "Deep",
          script: "dsh",
          reasoning: view.liveReason
            ? { text: view.liveReason, seconds: 1, open: true }
            : undefined,
          tools: view.liveTools,
          md: view.liveMd,
          status: "done",
        };
        batch(() => {
          messages.set([...view.messages, live]);
          liveId.set(live.id);
          liveMd.set(view.liveMd);
          liveReason.set(view.liveReason);
          liveTools.set(view.liveTools);
          if (since() === null) since.set(Date.now());
        });
        startTicker();
      } else {
        batch(() => {
          // A stopped or failed reply is the Pane's own (dsh kept only the
          // user's message): it stays under the durable transcript.
          const local = messages().filter(
            (item) =>
              item.kind === "assistant" &&
              item.status !== "done" &&
              !view.messages.some((durable) => durable.id === item.id),
          );
          messages.set(local.length ? [...view.messages, ...local] : view.messages);
          liveId.set(null);
          clearLiveSignals();
        });
        stopTicker();
      }
      return;
    }

    if (!view.running && !busy) {
      // The prompt was accepted but its first frame has not landed: the local
      // turn outlives a view that looks idle.
      if (liveId() !== null) return;
      // Another Pane consumed this turn's freeze first: settle this Pane from
      // the durable messages instead of keeping its local placeholder.
      if (view.messages.length) {
        commitProjected(view.messages);
        return;
      }
      const failure = controller().error();
      if (failure) {
        showConnectError(new Error(failure));
        return;
      }
      batch(() => {
        liveId.set(null);
        clearLiveSignals();
        prompting.set(false);
        since.set(null);
      });
      stopTicker();
      controller().acknowledgeFreeze();
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
  };

  cleanup(stopTicker);

  // A batch of messages (a whole history page, a finished turn) lands at once:
  // a list that follows the newest one keeps it in view.
  effect(() => {
    const count = messages().length;
    const isRunning = running();
    if (!following() || (count === 0 && !isRunning)) return;
    list?.scrollToEnd({ animated: false });
  });

  const stop = () => {
    if (!controller().running() && liveId() === null) return;
    // Freeze what was written first, so the stopped reply keeps it even when
    // the turn's end frame arrives on the same tick.
    // Freeze what was written first, so the stopped reply keeps it even when
    // the turn's end frame lands on the same tick.
    controller().cancelLocalTurn();
    void controller().cancel();
  };

  /** The files the composer holds become prompt parts (images inline, files staged). */
  const promptParts = async (text: string): Promise<PromptContentPart[] | undefined> => {
    const parts: PromptContentPart[] = [];
    if (text.trim()) parts.push({ type: "text", text });
    for (const item of controller().draftAttachments()) {
      const data = await blobToBase64(item.bytes);
      if (item.mediaType) {
        parts.push({ type: "image", mediaType: item.mediaType, data, name: item.name });
      } else {
        parts.push({
          type: "file",
          receiptId: (await controller().uploadFile(item.name, data)) as never,
        });
      }
    }
    return parts.length ? parts : undefined;
  };

  const submit = async () => {
    const current = controller();
    const text = current.draft().trim();
    const files = current.draftAttachments();
    if (!text && files.length === 0) return;
    following.set(true);
    const image = files.find((item) => item.mediaType);
    const file = files.find((item) => !item.mediaType);
    let content: PromptContentPart[] | undefined;
    try {
      content = await promptParts(text);
    } catch (error) {
      showConnectError(error);
      return;
    }
    const sent: Msg = {
      kind: "user",
      id: nextId(),
      at: Date.now(),
      text: text || "(attachment)",
      ...(image?.url ? { image: image.url } : {}),
      ...(file ? { file: { name: file.name, size: file.size } } : {}),
    };
    if (running()) {
      // Steering: dsh queues the prompt behind the running turn.
      batch(() => {
        messages.set([...messages(), sent]);
        current.clearDraft();
      });
      try {
        await current.queuePrompt(sent.text, content);
      } catch (error) {
        current.applyError(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    batch(() => {
      messages.set([...messages(), sent]);
      current.clearDraft();
    });
    toEnd();
    await replyDsh(sent.text, undefined, content);
  };

  /** A stopped or failed reply closes the list: nothing live may reopen it. */
  const frozenTail = () => {
    const all = messages();
    const last = all[all.length - 1];
    return last?.kind === "assistant" && last.status !== "done";
  };

  /** The reply being written, as the row list knows it. */
  const lastAssistantId = () => {
    const all = messages();
    for (let index = all.length - 1; index >= 0; index--) {
      const item = all[index];
      if (item.kind === "assistant") return item.id;
    }
    return nextId();
  };

  const promptBefore = (id: string) => {
    const all = messages();
    for (let index = all.findIndex((item) => item.id === id) - 1; index >= 0; index--) {
      const item = all[index];
      if (item.kind === "user") return item.text;
    }
    return "";
  };

  const regenerate = (message: Assistant) => {
    if (prompting()) return;
    const text = promptBefore(message.id);
    if (!text) return;
    following.set(true);
    void replyDsh(text, message.id);
  };

  const retry = (message: Assistant) => regenerate(message);

  const update = (id: string, change: (message: Assistant) => Assistant) =>
    messages.set(
      messages().map((item) => (item.id === id && item.kind === "assistant" ? change(item) : item)),
    );

  const copy = (id: string, text: string) => {
    void Clipboard.writeText(text);
    copied.set(id);
    setTimeout(() => copied() === id && copied.set(null), 1600);
  };

  const lastPrompt = () => {
    const all = messages();
    for (let index = all.length - 1; index >= 0; index--) {
      const item = all[index];
      if (item.kind === "user" && item.text.trim()) return item.text;
    }
    return "";
  };

  const model = () => {
    const catalog = modelCatalog();
    const options = (catalog?.models ?? []).slice(0, 20).map((item) => ({
      value: `${item.provider}/${item.model}`,
      label: item.name || item.model,
    }));
    const fallback = owner()?.bot.defaultModel ?? null;
    const current = catalogModelKey() ?? fallback ?? options[0]?.value ?? null;
    const label = options.find((item) => item.value === current)?.label ?? "Model";
    return { label, current, options };
  };

  const handlers: RowHandlers = {
    isOpen: (key) => expanded().has(key),
    onToggle: (key) => expanded.set(toggleKey(expanded(), key)),
    onRetry: (message) => retry(message),
    onRegenerate: (message) => regenerate(message),
    onRate: (message, rating) => update(message.id, (item) => ({ ...item, rating })),
    copied: () => copied(),
    onCopy: (id, text) => copy(id, text),
  };

  const drop = async (uris: readonly string[], types: readonly string[]) => {
    dragging.set(false);
    const { files, failed } = await filesFromUrls(uris, types);
    if (failed.length > 0) dropTrouble.set(`Could not read ${failed.join(", ")}.`);
    else dropTrouble.set(null);
    if (files.length > 0) controller().attachFiles(files);
  };

  /** The durable messages, with the reply being written folded in. */
  const displayMessages = () => {
    const id = liveId();
    if (id === null) return messages();
    const reasoning = liveReason();
    const thinking = liveThinking();
    const tools = liveTools();
    return messages().map((item) =>
      item.id === id && item.kind === "assistant"
        ? {
            ...item,
            md: liveMd() || item.md,
            reasoning: reasoning
              ? { text: reasoning, seconds: thinking?.seconds ?? 1, open: true }
              : item.reasoning,
            tools: tools.length ? tools : item.tools,
          }
        : item,
    );
  };

  const rows = () => {
    const built = buildRows({
      messages: displayMessages(),
      liveId: liveId(),
      running: running(),
      since: since(),
      now: now(),
    });
    return built;
  };

  /** Connection trouble only: the shared Connection's, else this Session's. */
  const banner = () => (native ? (sessionError() ?? controller().error()) : null);

  return (
    <View
      testID="chat"
      style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}
      onFileDragEnter={() => dragging.set(true)}
      onFileDragLeave={() => dragging.set(false)}
      onFileDrop={(event) => void drop(event.uris, event.mimeTypes)}
    >
      <ChatHeader
        title={() => `${botName()} · ${title()}`}
        subtitle={subtitle}
        modelLabel={() => model().label}
        scrolled={scrolled}
        onRename={(next) => void renameSession(props.controller.sessionId, next)}
      />
      <If when={!!banner()}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginHorizontal: 16,
            marginTop: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: radius.control,
            borderCurve: "continuous",
            backgroundColor: alpha(colors.danger, 0.1),
            borderWidth: 1,
            borderColor: alpha(colors.danger, 0.3),
          }}
        >
          <Text style={{ flex: 1, fontSize: 12, color: colors.text }}>{banner()}</Text>
          <Press
            onPress={() => void connectSession()}
            accessibilityLabel="Reconnect to the Host"
            scale={0.96}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent }}>Retry</Text>
          </Press>
        </View>
      </If>
      <If
        when={rows().length > 0}
        else={
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
            <Appear>
              <View style={{ alignItems: "center", gap: 10, maxWidth: 420, alignSelf: "center" }}>
                <IconTile name="spark" tint={colors.accent} size={48} />
                <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>
                  {`Message ${botName()}`}
                </Text>
                <Text
                  style={{ fontSize: 13, lineHeight: 19, color: colors.muted, textAlign: "center" }}
                >
                  {native
                    ? "Prompts go to the official dsh Session through the local Host."
                    : "The chat needs the desktop Client connected to Host / dsh."}
                </Text>
              </View>
            </Appear>
          </View>
        }
      >
        <Transcript
          rows={rows}
          botName={botName}
          now={() => now()}
          handlers={handlers}
          following={following}
          streaming={running}
          loadingOlder={() => controller().olderLoading()}
          onScrollState={(state) => {
            if (following() !== state.following) following.set(state.following);
            if (scrolled() !== state.scrolled) scrolled.set(state.scrolled);
          }}
          onLoadOlder={() => void controller().loadOlder()}
          onJump={() => toEnd()}
          listRef={(node) => (list = node)}
        />
      </If>
      <If when={!!dropTrouble()}>
        <Text style={{ paddingHorizontal: 16, paddingBottom: 4, fontSize: 12, color: colors.danger }}>
          {dropTrouble()}
        </Text>
      </If>
      <ApprovalCard controller={controller} />
      <Composer
        controller={controller}
        botName={botName}
        running={running}
        canSend={() => !!controller().draft().trim() || controller().draftAttachments().length > 0}
        model={model}
        recall={lastPrompt}
        onSend={() => void submit()}
        onStop={stop}
        onPickModel={(value) => void selectSessionModel(props.controller.sessionId, value)}
      />
      <If when={dragging()}>
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            top: 12,
            bottom: 12,
            borderRadius: radius.card,
            borderCurve: "continuous",
            borderWidth: 2,
            borderColor: colors.accent,
            backgroundColor: alpha(colors.accent, 0.06),
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.accent }}>
            Drop files to attach
          </Text>
        </View>
      </If>
    </View>
  );
}
