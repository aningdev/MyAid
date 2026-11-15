/**
 * A Session's chat: the header, the transcript, the approval waiting on the
 * person and the composer. Everything durable comes from the SessionController
 * (`TurnProjection` is the only frame → UI projector); this Pane owns what the
 * screen alone knows — the expansion of tool rows, the follow state, the
 * working row's clock — and the send / stop / retry actions.
 */
import type { PromptContentPart } from "@myaid/dsh-web-protocol/session";
import { Sparkles, TriangleAlert } from "lucide";
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
  token,
} from "nsh";
import { LayoutAnimation } from "nsh";

import { Appear, IconTile } from "../../components/app";
import { Alert, AlertDescription, ALERT_ICON } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Pressable } from "../../components/ui/pressable";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { alpha, radius } from "../../lib/theme";
import { BotMark } from "../bots/BotMark";
import { segmentOwner } from "../bots/model";
import { conversationOf, sessionLabel, type ConversationSegment } from "../bots/sessions";
import { registry } from "../bots/state";
import { newTopic, changeWorkingDirectory } from "../workspace/conversation";
import { displayPath } from "../workspace/paths";
import { workspacePath, workspaces } from "../workspace/state";
import { ApprovalCard } from "./chat/ApprovalCard";
import { attachDropped } from "./chat/attach";
import { ChatHeader } from "./chat/ChatHeader";
import { Composer } from "./chat/Composer";
import { blobToBase64 } from "./chat/files";
import { requestComposerFocus } from "./chat/focus";
import { HistoryRail, type RailMark } from "./chat/HistoryRail";
import { type RowHandlers } from "./chat/MessageRow";
import { buildConversationRows, buildRows, toggleKey, type SegmentInput } from "./chat/rows";
import type { Msg, Tool } from "./chat/scripts";
import { clockLabel, dayLabel } from "./chat/time";
import { Transcript } from "./chat/Transcript";
import type { SessionController } from "./session/controller";
import {
  catalogModelKey,
  connectSession,
  controllerFor,
  modelCatalog,
  renameSession,
  selectSessionModel,
  sessionError,
  sessionList,
} from "./session/runtime";
import { freezeMessages } from "./session/turn";

type Assistant = Extract<Msg, { kind: "assistant" }>;

/** A segment with the path as the UI reads it, keeping the canonical one. */
type ShownSegment = ConversationSegment & { fullPath: string };

/**
 * Dialogue main pane — renders one SessionController's TurnProjection; the
 * controller owns frames, turn freeze, approvals, the draft and its files.
 * With `history`, it is a Bot's whole long conversation: older segments load
 * into the same transcript above the current one, under their own divider.
 */
export function ChatPane(props: {
  controller: SessionController;
  history?: boolean;
  /** The Session controllers in this surface; the product uses the shared registry. */
  controllerOf?: (sessionId: string) => SessionController;
}) {
  const controller = () => props.controller;
  const controllerOf = (sessionId: string) =>
    props.controllerOf ? props.controllerOf(sessionId) : controllerFor(sessionId);
  const native = platform.idiom === "desktop" && platform.os !== "web";
  const owner = () => segmentOwner(registry(), props.controller.sessionId);
  const bot = () => owner()?.bot ?? null;
  const botName = () => bot()?.name ?? "Bot";
  const title = () => {
    const row = sessionList().find((item) => item.id === props.controller.sessionId);
    return row?.label ?? owner()?.segment.title ?? t("chat.newSession");
  };
  const currentShown = () =>
    segments().find((segment) => segment.sessionId === controller().sessionId) ??
    segments()[segments().length - 1] ??
    null;
  const subtitle = () => currentShown()?.path ?? "";
  const fullSubtitle = () => currentShown()?.fullPath ?? "";

  let ids = 0;
  const nextId = () => `m${ids++}`;

  const messages = signal<Msg[]>([]);
  /** Older segments loaded into the transcript, oldest first. */
  const olderLoaded = signal<string[]>([]);
  /** The top of the list is opening a page or another segment. */
  const loadingOlder = signal(false);
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
  /** The Session the reset effect last saw, to keep a new segment's history above. */
  let lastSession: string | null = null;

  // Absolute live strings collect here and reach the signals once per frame.
  let pendingMd: string | null = null;
  let pendingReason: string | null = null;
  let frameQueued = false;

  let thinkStart = 0;
  let thinkSeconds: number | null = null;

  const running = () => controller().running() || liveId() !== null;

  /** The path as the UI reads it; the canonical path rides along for tooltips. */
  const shown = (segment: ConversationSegment): ShownSegment => ({
    ...segment,
    fullPath: segment.path,
    path: displayPath(segment.path),
  });

  /** The Bot's segments (oldest first), or just this Session outside history. */
  const segments = (): ShownSegment[] => {
    const current = owner();
    if (!current) return [];
    if (!props.history) {
      const row = sessionList().find((item) => item.id === current.segment.sessionId);
      return [
        shown({
          index: 0,
          sessionId: current.segment.sessionId,
          workspaceId: current.segment.workspaceId,
          path: workspacePath(workspaces(), current.segment),
          title: current.segment.title,
          current: true,
          updatedAt: row?.updatedAt ?? null,
          missing: row?.missing ?? false,
        }),
      ];
    }
    const listed = sessionList().map((row) => ({
      sessionId: row.id,
      blank: false,
      updatedAt: row.updatedAt ?? 0,
      running: row.running,
    }));
    return conversationOf(registry(), workspaces(), listed, current.bot.id).map(shown);
  };
  const latest = () => segments()[segments().length - 1] ?? null;
  /** Segments loaded above the current one, in conversation order. */
  const loadedSegments = () => {
    const loaded = new Set(olderLoaded());
    return segments().filter((segment) => !segment.current && loaded.has(segment.sessionId));
  };
  const segmentAt = (segment: ConversationSegment, past: readonly Msg[]): number => {
    const first = past.find((message) => message.at !== undefined)?.at;
    return first ?? segment.updatedAt ?? Date.now();
  };
  const nowMs = () => now();

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

  // A different Session (or a reset) starts from nothing. A new segment of the
  // same Bot keeps the previous transcript above it: the old content stays.
  effect(() => {
    const current = controller();
    const nextId = current.sessionId;
    if (nextId === lastSession) return;
    const all = segments();
    const at = all.findIndex((segment) => segment.sessionId === nextId);
    const previous = lastSession
      ? all.findIndex((segment) => segment.sessionId === lastSession)
      : -1;
    const continues = props.history === true && previous >= 0 && at === previous + 1;
    const kept = continues ? [...untracked(olderLoaded), lastSession!] : [];
    lastSession = nextId;
    stopTicker();
    messages.set([]);
    liveId.set(null);
    clearLiveSignals();
    prompting.set(false);
    since.set(null);
    following.set(true);
    olderLoaded.set([...new Set(kept)]);
    loadingOlder.set(false);
  });

  // A new segment starts at the bottom: even an empty one shows its divider,
  // not the previous segment's last viewport.
  effect(() => {
    const current = controller();
    current.sessionId;
    if (!following()) return;
    const timers = [80, 400].map((delay) =>
      setTimeout(() => {
        if (following()) list?.scrollToEnd({ animated: true });
      }, delay),
    );
    cleanup(() => {
      for (const timer of timers) clearTimeout(timer);
    });
  });

  // Older segments stay followed while they are in the transcript.
  effect(() => {
    const mounted = olderLoaded().map((sessionId) => {
      const older = controllerOf(sessionId);
      older.mount();
      return older;
    });
    cleanup(() => {
      for (const older of mounted) older.unmount();
    });
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
        // only the user's message, so the live bubble comes after it. A
        // completed reply is already on that page: never commit it twice.
        commitProjected(freezeMessages(freeze.messages, liveFinal));
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
      // A local turn's reply can arrive without a running phase or live
      // frames: the follow stream recovered after the turn, and its snapshot
      // holds the finished exchange. Once the durable view ends in a reply,
      // the local placeholder has been answered and must settle, or the pane
      // keeps an empty bubble for good.
      if (liveId() !== null && !answered(view)) return;
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
    // `/new` is the palette's 「新话题」 in the composer: a new segment in the
    // Bot's current working directory; the old transcript stays above.
    if (text === "/new" && files.length === 0) {
      const currentBot = bot();
      if (!currentBot) return;
      current.clearDraft();
      const sessionId = await newTopic(currentBot.id);
      if (sessionId) requestComposerFocus(sessionId);
      return;
    }
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
      text: text || t("chat.attachmentOnly"),
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

  /** The durable view ends in a reply: this turn's answer is on the record. */
  const answered = (view: ReturnType<SessionController["view"]>) => {
    const last = view.messages[view.messages.length - 1];
    return last?.kind === "assistant";
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
    const label = options.find((item) => item.value === current)?.label ?? t("bot.model");
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
    const { files, notice } = await attachDropped(uris, types);
    dropTrouble.set(notice);
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

  /** Open the next older page: within the oldest loaded segment, then the segment before it. */
  const loadOlder = async () => {
    if (loadingOlder()) return;
    const current = controller();
    await current.start().catch(() => undefined);
    if (current.view().olderHasMore) {
      await current.loadOlder().catch(() => undefined);
      return;
    }
    const loaded = loadedSegments();
    const oldest = loaded[0];
    if (oldest) {
      const older = controllerOf(oldest.sessionId);
      await older.start().catch(() => undefined);
      if (older.view().olderHasMore) {
        loadingOlder.set(true);
        try {
          await older.loadOlder().catch(() => undefined);
        } finally {
          loadingOlder.set(false);
        }
        return;
      }
    }
    const all = segments();
    const from = oldest ? oldest.index : all.length - 1;
    const next = all[from - 1];
    if (!next) return;
    loadingOlder.set(true);
    olderLoaded.set([next.sessionId, ...olderLoaded()]);
    try {
      await controllerOf(next.sessionId)
        .start()
        .catch(() => undefined);
    } finally {
      loadingOlder.set(false);
    }
  };

  /** The rail's jump: load the target and every newer segment, then scroll to its start. */
  const jumpToSegment = async (index: number) => {
    const all = segments();
    const target = all[index];
    if (!target) return;
    const older = all.slice(index, -1).map((segment) => segment.sessionId);
    olderLoaded.set(older);
    await Promise.all(
      older.map((sessionId) =>
        controllerOf(sessionId)
          .start()
          .catch(() => undefined),
      ),
    );
    if (target.current) {
      toEnd();
      return;
    }
    // The rows exist after the loaded segment's first view lands. The first
    // pass scrolls by estimate; the second corrects once the list measured
    // the loaded rows (a long older transcript makes the estimate drift).
    const place = () => {
      const at = rows().findIndex(
        (row) => row.kind === "segment" && row.sessionId === target.sessionId,
      );
      if (at < 0) return;
      following.set(false);
      list?.scrollToIndex({ index: at, animated: true, viewPosition: 0 });
    };
    setTimeout(place, 80);
    setTimeout(place, 360);
  };

  const railMarks = (): RailMark[] => {
    const rows = new Map(sessionList().map((row) => [row.id, row]));
    return segments().map((segment) => {
      const view = olderLoaded().includes(segment.sessionId)
        ? controllerOf(segment.sessionId).view()
        : null;
      const at = segmentAt(segment, view?.messages ?? []);
      const row = rows.get(segment.sessionId);
      return {
        sessionId: segment.sessionId,
        label: row?.label ?? sessionLabel({ title: segment.title }, null),
        time: `${dayLabel(at, now())} ${clockLabel(at)}`,
        path: segment.path,
        fullPath: segment.fullPath,
        current: segment.current,
      };
    });
  };

  const rows = () => {
    if (!props.history) {
      return buildRows({
        messages: displayMessages(),
        liveId: liveId(),
        running: running(),
        since: since(),
        now: now(),
      });
    }
    const at = now();
    const inputs: SegmentInput[] = [];
    for (const segment of loadedSegments()) {
      const past = controllerOf(segment.sessionId).view().messages;
      inputs.push({
        sessionId: segment.sessionId,
        label: dayLabel(segmentAt(segment, past), at),
        path: segment.path,
        fullPath: segment.fullPath,
        current: false,
        messages: past,
      });
    }
    const current = latest();
    if (current) {
      const past = displayMessages();
      inputs.push({
        sessionId: current.sessionId,
        label: dayLabel(segmentAt(current, past), at),
        path: current.path,
        fullPath: current.fullPath,
        current: true,
        messages: past,
      });
    }
    return buildConversationRows({
      segments: inputs,
      liveId: liveId(),
      running: running(),
      since: since(),
      now: at,
    });
  };

  /** Connection trouble only: the shared Connection's, else this Session's. */
  const banner = () => (native ? (sessionError() ?? controller().error()) : null);

  return (
    <View
      testID="chat"
      style={{ flex: 1, minHeight: 0, backgroundColor: token("background") }}
      onFileDragEnter={() => dragging.set(true)}
      onFileDragLeave={() => dragging.set(false)}
      onFileDrop={(event) => void drop(event.uris, event.mimeTypes)}
    >
      <ChatHeader
        title={title}
        subtitle={subtitle}
        fullPath={fullSubtitle}
        modelLabel={() => model().label}
        scrolled={scrolled}
        bot={bot}
        working={running}
        onRename={(next) => void renameSession(props.controller.sessionId, next)}
        onWorkspace={(path) => {
          const current = bot();
          if (current) void changeWorkingDirectory(current.id, path);
        }}
      />
      <If when={!!banner()}>
        <Alert
          testID="chat-banner"
          variant="destructive"
          style={{ marginHorizontal: 16, marginTop: 8 }}
        >
          <Icon icon={TriangleAlert} size={ALERT_ICON} tint={token("destructive")} />
          <AlertDescription>
            <Text style={{ fontSize: 12, color: token("foreground") }}>{banner()}</Text>
            <Button size="sm" variant="ghost" onPress={() => void connectSession()}>
              {t("common.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      </If>
      <If
        when={rows().length > 0}
        else={
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 16 }}>
            <Appear>
              <View style={{ alignItems: "center", gap: 10, maxWidth: 420, alignSelf: "center" }}>
                <If
                  when={bot()}
                  else={<IconTile icon={Sparkles} tint={token("brand")} size={48} />}
                >
                  {(current) => <BotMark identity={current().identity} size={48} />}
                </If>
                <Text style={{ fontSize: 17, fontWeight: "600", color: token("foreground") }}>
                  {t("chat.messageBot", { name: botName() })}
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    lineHeight: 19,
                    color: token("muted-foreground"),
                    textAlign: "center",
                  }}
                >
                  {native ? t("chat.promptsHost") : t("chat.needsHost")}
                </Text>
              </View>
            </Appear>
          </View>
        }
      >
        <View style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <Transcript
            rows={rows}
            botName={botName}
            bot={bot}
            now={() => now()}
            handlers={handlers}
            following={following}
            streaming={running}
            loadingOlder={() => loadingOlder() || controller().olderLoading()}
            onScrollState={(state) => {
              if (following() !== state.following) following.set(state.following);
              if (scrolled() !== state.scrolled) scrolled.set(state.scrolled);
            }}
            onLoadOlder={() => void loadOlder()}
            onJump={() => toEnd()}
            listRef={(node) => (list = node)}
          />
          <If when={!!props.history && segments().length > 0}>
            <HistoryRail marks={railMarks} onJump={(index) => void jumpToSegment(index)} />
          </If>
        </View>
      </If>
      <If when={!!dropTrouble()}>
        <Text
          style={{
            paddingHorizontal: 16,
            paddingBottom: 4,
            fontSize: 12,
            color: token("destructive"),
          }}
        >
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
            borderColor: token("brand"),
            backgroundColor: alpha(token("brand"), 0.06),
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: token("brand") }}>
            {t("chat.dropFiles")}
          </Text>
        </View>
      </If>
    </View>
  );
}
