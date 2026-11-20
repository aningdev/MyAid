/**
 * Deep module: one live Session per controller. The official Client model owns
 * the Session (list row, history window with atomic per-generation
 * replacement, paging, follow, prompt/queue/cancel state); this controller
 * owns what the product adds — the composer draft and its files, the local
 * turn bubble and its freeze, approvals, and the Panel-facing view.
 *
 * The lazy registry keeps controllers for the Sessions Panels show and for
 * replies still running off-screen. The shared Connection belongs to
 * ClaimedSession, not here.
 */
import type {
  SessionEventSource,
  SessionEventWindow,
  SessionFace,
  SessionId,
  SessionReference,
  SessionSnapshot,
} from "@dsh-bot/dsh-web-protocol/client";
import type { PromptContentPart } from "@dsh-bot/dsh-web-protocol/session";
import { signal, untracked } from "nsh";

import { t } from "../../../lib/i18n";
import type { BotRegistry } from "../../bots/model";
import { segmentOwner } from "../../bots/model";
import {
  addAttachment,
  attachmentFromFile,
  removeAttachment,
  type Attachment,
} from "../chat/attachments";
import {
  occupancyBlock,
  resolveBotModel,
  type ApprovalDecision,
  type ApprovalRequest,
  type SessionHost,
} from "./claimed";
import type { SessionStatus } from "./roster";
import { TurnProjection, type TurnView } from "./turn";

export type { ApprovalDecision, ApprovalRequest, Attachment };

declare module "@deepseek-ai/dsh-api-session-controller/client" {
  interface SessionReferenceSourceMap {
    /** One Dialogue Panel (or a running reply it left behind) showing a Session. */
    panel: unknown;
  }
}

/** One prompt waiting in the live Agent's inbox, shown above the composer. */
export type QueuedPrompt = {
  /** The Client's `requestId`, its identity here. */
  requestId: string;
  /** The queue item's message id, once dsh reports it; withdrawal needs it. */
  itemId: string | null;
  text: string;
};

function emptyView(): TurnView {
  return {
    messages: [],
    running: false,
    status: "",
    liveMd: "",
    liveReason: "",
    liveTools: [],
    liveId: null,
    olderHasMore: false,
    deliverables: [],
    pendingFreeze: null,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function textBlocks(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const block = object(item);
      return block.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .join("");
}

/** The `inbox` projection rows as the composer's pending list. */
function queueRows(value: unknown): QueuedPrompt[] {
  const inbox = object(value);
  const rows = [inbox["next-turn"], inbox["next-step"]].flatMap((list) =>
    Array.isArray(list) ? list : [],
  );
  const items: QueuedPrompt[] = [];
  for (const row of rows) {
    const message = object(row);
    const itemId = typeof message.id === "string" ? message.id : "";
    if (!itemId) continue;
    const source = object(message.source);
    items.push({
      requestId: typeof source.rpcId === "string" ? source.rpcId : itemId,
      itemId,
      text: textBlocks(message.content),
    });
  }
  return items;
}

/** What a SessionController needs from the product runtime. */
export type SessionControllerHost = {
  /** Shared Connection, connected on demand. */
  ensureHost(): Promise<SessionHost>;
  host(): SessionHost | undefined;
  registry(): BotRegistry;
  /** dsh archived this Session: it stays readable, but no new turn starts. */
  sessionArchived(sessionId: string): boolean;
  summaries(): Map<string, string>;
  /** Sessions currently executing (same-workspace guard). */
  occupyingSessionIds(): readonly string[];
  /** A view arrived: summarize it, but do not treat streaming as a status change. */
  onView(sessionId: string, view: TurnView): void;
  /** Running / approval state may have changed. */
  onStatusChange(sessionId: string): void;
  /** A Panel shows this Session: clear its unread mark. */
  onShown(sessionId: string): void;
  /** A reply finished while no Panel showed this Session. */
  onFinishedHidden(sessionId: string): void;
  /** This controller left the registry. */
  onDispose(sessionId: string): void;
};

type PendingApproval = {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
  detach?: () => void;
};

/**
 * One Session, read from the official Client model. Created lazily by
 * SessionRegistry and disposed once no Panel shows it and it is neither
 * running nor waiting on approval.
 */
export class SessionController {
  readonly view = signal<TurnView>(emptyView());
  /** The composer's text, kept per Session while Panels come and go. */
  readonly draft = signal("");
  /** Files the composer holds for this Session. */
  readonly draftAttachments = signal<readonly Attachment[]>([]);
  /** Prompts dsh queued behind the running turn. */
  readonly queued = signal<readonly QueuedPrompt[]>([]);
  readonly error = signal<string | null>(null);
  readonly running = signal(false);
  readonly pendingApproval = signal<ApprovalRequest | null>(null);
  /** A page of older history is on its way. */
  readonly olderLoading = signal(false);

  private turns = new TurnProjection();
  private reference: SessionReference | undefined;
  private binding: { session: SessionFace; eventSource: SessionEventSource } | undefined;
  private detach: (() => void)[] = [];
  private starting: Promise<void> | undefined;
  private mounts = 0;
  /** A release is pending: the Panel may only be re-rendering. */
  private disposeSoon: ReturnType<typeof setTimeout> | undefined;
  private prompting = false;
  private approvals: PendingApproval[] = [];
  private disposed = false;
  /** Prompt request ids the projection has not echoed yet. */
  private echo = new Map<string, string>();
  /** The visible error came from the official snapshot, so a healthy one clears it. */
  private modelError = false;

  constructor(
    readonly sessionId: string,
    private readonly host: SessionControllerHost,
  ) {}

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** True from a sent prompt until its turn ends, including before the first frame. */
  get busy(): boolean {
    return this.prompting || untracked(this.running);
  }

  /** A Panel now shows this Session. Clears unread; binds the model when needed. */
  mount(): void {
    if (this.disposed) return;
    if (this.disposeSoon !== undefined) {
      clearTimeout(this.disposeSoon);
      this.disposeSoon = undefined;
    }
    this.mounts += 1;
    this.host.onShown(this.sessionId);
    void this.start();
  }

  /** The Panel stopped showing it; an idle controller is released next tick. */
  unmount(): void {
    if (this.mounts > 0) this.mounts -= 1;
    this.maybeDispose();
  }

  /** Bind the official Session and read its current state. */
  async start(): Promise<void> {
    if (this.disposed || this.binding) return;
    if (this.starting) return this.starting;
    const work = (async () => {
      try {
        this.error.set(null);
        const host = await this.host.ensureHost();
        if (this.disposed) return;
        if (!host.ready) throw new Error(t("session.hostDown"));
        // `retain` starts the shared history opening: the window arrives through
        // the official model, replaced atomically per Host generation.
        const reference = host.sessions.retain(this.sessionId as SessionId, { source: "panel" });
        this.reference = reference;
        await reference.ready;
        if (this.disposed) {
          reference.release();
          return;
        }
        this.bind(reference.binding.session, reference.binding.eventSource);
      } catch (error) {
        this.fail(messageOf(error));
      }
    })();
    this.starting = work.finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  /* Composer state: the draft and its files belong to the Session, so a Panel
   * switch keeps them and two Panels on one Session share them. */
  setDraft(value: string): void {
    this.draft.set(value);
  }

  attachFile(file: Blob & { name?: string }): void {
    this.draftAttachments.set(addAttachment(this.draftAttachments(), attachmentFromFile(file)));
  }

  attachFiles(files: readonly (Blob & { name?: string })[]): void {
    let next = this.draftAttachments();
    for (const file of files) next = addAttachment(next, attachmentFromFile(file));
    this.draftAttachments.set(next);
  }

  detachFile(id: string): void {
    this.draftAttachments.set(removeAttachment(this.draftAttachments(), id));
  }

  clearDraft(): void {
    this.draft.set("");
    this.draftAttachments.set([]);
  }

  /** Read one page of history above the window (official `loadOlder`). */
  async loadOlder(): Promise<void> {
    if (this.disposed || untracked(this.olderLoading)) return;
    if (!untracked(this.view).olderHasMore) return;
    this.olderLoading.set(true);
    try {
      await (await this.session()).loadOlder();
    } catch (error) {
      this.error.set(messageOf(error));
    } finally {
      this.olderLoading.set(false);
    }
  }

  /** A prompt sent while a turn runs: dsh queues it; it never begins a local turn. */
  async queuePrompt(text: string, content?: readonly PromptContentPart[]): Promise<void> {
    if (this.disposed) throw new Error(t("session.disposed"));
    const session = await this.session();
    const requestId = crypto.randomUUID().replace(/-/g, "");
    this.echo.set(requestId, text);
    this.publishQueue();
    const result = await session.prompt(
      [...(content ?? [{ type: "text" as const, text }])],
      "queue",
      undefined,
      requestId as never,
    );
    if (!result.ok) {
      this.echo.delete(requestId);
      this.publishQueue();
      throw new Error(`${result.error.code}: ${result.error.message}`);
    }
  }

  /** Takes a queued prompt back out of the Agent's inbox. */
  async withdrawQueued(requestId: string): Promise<void> {
    const entry = this.queued().find((item) => item.requestId === requestId);
    if (!entry) return;
    if (!entry.itemId) {
      // Not admitted yet: drop the local echo and forget the prompt entirely.
      this.echo.delete(requestId);
      this.publishQueue();
      return;
    }
    try {
      const result = await (
        await this.session()
      ).updateQueue(entry.itemId as never, {
        kind: "remove",
      });
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    } catch (error) {
      this.error.set(messageOf(error));
    }
  }

  /** Send a prompt through the official Session; the local bubble is begun by the Pane. */
  async prompt(text: string, content?: readonly PromptContentPart[]): Promise<string> {
    if (this.disposed) throw new Error(t("session.disposed"));
    const owner = segmentOwner(this.host.registry(), this.sessionId);
    if (!owner) throw new Error(t("session.ownerless"));
    if (this.host.sessionArchived(this.sessionId)) {
      throw new Error(t("session.archived"));
    }
    const blocked = occupancyBlock({
      occupyingSessionIds: this.host.occupyingSessionIds(),
      targetSessionId: this.sessionId,
      registry: this.host.registry(),
      summaries: this.host.summaries(),
    });
    if (blocked) throw new Error(blocked);
    this.error.set(null);
    this.prompting = true;
    try {
      const host = await this.host.ensureHost();
      const session = await this.session();
      try {
        const catalog = await host.modelCatalog();
        const selected = await resolveBotModel(catalog, owner.bot.defaultModel);
        if (selected) {
          await host.selectModel({
            sessionId: this.sessionId,
            provider: selected.provider,
            model: selected.model,
            // The Bot's thinking level (Bot Settings › Runs with), when it set one.
            ...(owner.bot.defaultThinking ? { reasoningEffort: owner.bot.defaultThinking } : {}),
          });
        }
      } catch {
        // Model apply is best-effort; prompt still proceeds.
      }
      const requestId = crypto.randomUUID().replace(/-/g, "");
      const result = await session.prompt(
        [...(content ?? [{ type: "text" as const, text }])],
        "queue",
        undefined,
        requestId as never,
      );
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      return requestId;
    } catch (error) {
      this.applyError(messageOf(error));
      throw error;
    }
  }

  /** Stages a file's bytes; the prompt then names the receipt. */
  async uploadFile(name: string, data: string): Promise<string> {
    const host = await this.host.ensureHost();
    const receipt = await host.uploadFile({ sessionId: this.sessionId, data, name });
    return receipt.receiptId;
  }

  async cancel(): Promise<void> {
    const session = this.binding?.session;
    if (!session) return;
    const result = await session.cancel();
    if (!result.ok) this.error.set(`${result.error.code}: ${result.error.message}`);
  }

  /** The Pane added its local assistant bubble. */
  beginLocalTurn(assistantId: string): void {
    this.turns.beginTurn(assistantId);
    this.view.set(this.turns.snapshot());
  }

  acknowledgeFreeze(): void {
    this.turns.acknowledgeFreeze();
    this.view.set(this.turns.snapshot());
  }

  cancelLocalTurn(): void {
    this.prompting = false;
    this.publish(this.turns.cancel());
  }

  applyError(message: string): void {
    const wasRunning = untracked(this.running);
    this.modelError = false;
    this.error.set(message);
    this.prompting = false;
    this.publish(this.turns.applyError(message));
    if (wasRunning) this.finished();
  }

  /** The Connection's approval handler routes one request to its Session. */
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    if (this.disposed) return Promise.resolve("cancelled");
    return new Promise<ApprovalDecision>((resolve) => {
      const entry: PendingApproval = { request, resolve };
      const abort = () => {
        const at = this.approvals.indexOf(entry);
        if (at < 0) return;
        this.approvals.splice(at, 1);
        entry.detach?.();
        this.publishApproval();
        resolve("cancelled");
      };
      request.signal?.addEventListener("abort", abort, { once: true });
      entry.detach = () => request.signal?.removeEventListener("abort", abort);
      this.approvals.push(entry);
      this.publishApproval();
    });
  }

  answerApproval(decision: ApprovalDecision): void {
    const next = this.approvals.shift();
    if (!next) return;
    next.detach?.();
    this.publishApproval();
    next.resolve(decision);
  }

  dispose(): void {
    if (this.disposeSoon !== undefined) {
      clearTimeout(this.disposeSoon);
      this.disposeSoon = undefined;
    }
    if (this.disposed) return;
    this.disposed = true;
    for (const stop of this.detach.splice(0)) stop();
    this.binding = undefined;
    this.clearApprovals();
    // Releasing the last reference tears the local generation down (history
    // stream and Agent scope); a running Host turn keeps running.
    this.reference?.release();
    this.reference = undefined;
    this.host.onDispose(this.sessionId);
  }

  /** The Connection went away: release the old generation and read the new one. */
  rebind(): void {
    if (this.disposed) return;
    for (const stop of this.detach.splice(0)) stop();
    this.binding = undefined;
    this.reference?.release();
    this.reference = undefined;
    if (this.mounts > 0 || this.busy) void this.start();
  }

  /** Bind the official Session: subscribe once, then read what it holds now. */
  private bind(session: SessionFace, eventSource: SessionEventSource): void {
    this.binding = { session, eventSource };
    this.detach.push(session.subscribe(() => this.refresh()));
    this.detach.push(eventSource.subscribe(() => this.refresh()));
    this.detach.push(session.projections.faceOf("inbox").subscribe(() => this.publishQueue()));
    this.refresh();
    this.publishQueue();
  }

  /** Window + snapshot → one view. Both sources publish on the same tick. */
  private refresh(): void {
    const binding = this.binding;
    if (!binding || this.disposed) return;
    const state: SessionSnapshot = binding.session.getSnapshot();
    const window: SessionEventWindow = binding.eventSource.getSnapshot();
    const wasRunning = untracked(this.running);
    this.olderLoading.set(state.loadingOlder);
    if (state.promptError) {
      this.modelError = true;
      this.error.set(`${state.promptError.error.code}: ${state.promptError.error.message}`);
    } else if (state.openError) {
      this.modelError = true;
      this.error.set(`${state.openError.code}: ${state.openError.message}`);
    } else if (this.modelError && state.openState === "open") {
      // A new Host generation served this Session again: the loss notice is
      // historical, not a standing fault.
      this.modelError = false;
      this.error.set(null);
    }
    const view = this.turns.apply(window, state.running);
    this.publish(view);
    if (wasRunning && !view.running) this.finished();
  }

  private publish(view: TurnView): void {
    this.view.set(view);
    if (view.running !== untracked(this.running)) {
      this.running.set(view.running);
      this.host.onStatusChange(this.sessionId);
    }
    this.host.onView(this.sessionId, view);
    // The local turn is over once its bubble freezes — whether the pane saw it
    // stream or only read it back from a replaced window.
    if (view.pendingFreeze) this.prompting = false;
  }

  /** The inbox projection plus prompts dsh has not echoed yet. */
  private publishQueue(): void {
    const inbox = this.binding?.session.projections.faceOf("inbox").getSnapshot();
    const pending = queueRows(inbox);
    for (const [requestId, text] of [...this.echo]) {
      if (pending.some((item) => item.requestId === requestId || item.text === text)) {
        this.echo.delete(requestId);
      }
    }
    const echoing: QueuedPrompt[] = [...this.echo].map(([requestId, text]) => ({
      requestId,
      itemId: null,
      text,
    }));
    const next = [...pending, ...echoing];
    const current = this.queued();
    if (
      current.length === next.length &&
      current.every(
        (item, index) =>
          item.requestId === next[index]?.requestId && item.itemId === next[index]?.itemId,
      )
    ) {
      return;
    }
    this.queued.set(next);
    this.host.onStatusChange(this.sessionId);
  }

  /** The bound Session, waiting for the first bind if a Panel raced it. */
  private async session(): Promise<SessionFace> {
    const current = this.bound();
    if (current) return current.session;
    await this.start();
    const bound = this.bound();
    if (!bound) throw new Error(t("session.notReady"));
    return bound.session;
  }

  /** The current binding (a method, so a fresh read survives an await). */
  private bound(): { session: SessionFace; eventSource: SessionEventSource } | undefined {
    return this.binding;
  }

  private finished(): void {
    this.prompting = false;
    if (this.mounts === 0) this.host.onFinishedHidden(this.sessionId);
    this.maybeDispose();
  }

  private fail(message: string): void {
    if (this.disposed) return;
    this.modelError = false;
    this.error.set(message);
    this.prompting = false;
    this.maybeDispose();
  }

  private clearApprovals(): void {
    const had = this.approvals.length > 0;
    for (const entry of this.approvals) {
      entry.detach?.();
      entry.resolve("cancelled");
    }
    this.approvals = [];
    if (!had && untracked(this.pendingApproval) === null) return;
    this.pendingApproval.set(null);
    this.host.onStatusChange(this.sessionId);
  }

  private publishApproval(): void {
    this.pendingApproval.set(this.approvals[0]?.request ?? null);
    if (!this.disposed) this.host.onStatusChange(this.sessionId);
  }

  /**
   * Release once this Session is worth nothing to the product: no Panel, no
   * running turn, no approval, no draft. The release waits a tick because a
   * Panel re-render unmounts and mounts on the same tick, and every release
   * also drops the official local generation (history stream and Agent scope),
   * which would otherwise reopen on every frame.
   */
  private maybeDispose(): void {
    if (this.disposed || this.mounts > 0 || this.disposeSoon !== undefined) return;
    if (untracked(this.running) || this.prompting || this.approvals.length > 0) return;
    // A draft belongs to the Session: its controller stays until it is sent or
    // emptied, so switching Panels never loses what was written.
    if (untracked(this.draft).length > 0 || untracked(this.draftAttachments).length > 0) return;
    this.disposeSoon = setTimeout(() => {
      this.disposeSoon = undefined;
      this.dispose();
    }, 0);
  }
}

export type SessionRegistryHost = {
  ensureHost(): Promise<SessionHost>;
  host(): SessionHost | undefined;
  registry(): BotRegistry;
  /** dsh archived this Session: it stays readable, but no new turn starts. */
  sessionArchived(sessionId: string): boolean;
  summaries(): Map<string, string>;
  /** Controller membership, unread, running or approval changed. */
  onChange(): void;
  /** A followed view arrived (used for the first-prompt title). */
  onView?(sessionId: string, view: TurnView): void;
};

/**
 * Controllers by Session id. Lazy creation; a controller leaves when no Panel
 * shows it, it is not running, and no approval waits on it.
 */
export class SessionRegistry {
  private readonly controllers = new Map<string, SessionController>();
  private readonly unread = new Set<string>();

  constructor(private readonly host: SessionRegistryHost) {}

  controllerFor(sessionId: string): SessionController {
    const existing = this.controllers.get(sessionId);
    if (existing) return existing;
    const controller = new SessionController(sessionId, {
      ensureHost: () => this.host.ensureHost(),
      host: () => this.host.host(),
      registry: () => this.host.registry(),
      sessionArchived: (id) => this.host.sessionArchived(id),
      summaries: () => this.host.summaries(),
      occupyingSessionIds: () => this.runningSessionIds(),
      onView: (id, view) => this.host.onView?.(id, view),
      onStatusChange: () => this.host.onChange(),
      onShown: (id) => this.clearUnread(id),
      onFinishedHidden: (id) => this.markUnread(id),
      onDispose: (id) => {
        this.controllers.delete(id);
        this.host.onChange();
      },
    });
    this.controllers.set(sessionId, controller);
    this.host.onChange();
    return controller;
  }

  peek(sessionId: string): SessionController | undefined {
    return this.controllers.get(sessionId);
  }

  statusOf(sessionId: string): SessionStatus {
    const controller = this.controllers.get(sessionId);
    return {
      running: controller ? controller.running() : false,
      unread: this.unread.has(sessionId),
      attention: controller ? controller.pendingApproval() !== null : false,
    };
  }

  statuses(): Map<string, SessionStatus> {
    const statuses = new Map<string, SessionStatus>();
    for (const [sessionId, controller] of this.controllers) {
      statuses.set(sessionId, {
        running: controller.running(),
        unread: this.unread.has(sessionId),
        attention: controller.pendingApproval() !== null,
      });
    }
    for (const sessionId of this.unread) {
      if (!statuses.has(sessionId)) {
        statuses.set(sessionId, { running: false, unread: true, attention: false });
      }
    }
    return statuses;
  }

  runningSessionIds(): string[] {
    return [...this.controllers.values()]
      .filter((controller) => controller.running())
      .map((controller) => controller.sessionId);
  }

  /** A new Host generation is ready: Panels that show a Session read it again. */
  reattach(): void {
    for (const controller of this.controllers.values()) void controller.start();
  }

  /** The Connection was replaced: drop the old bindings and read the new model. */
  rebind(): void {
    for (const controller of [...this.controllers.values()]) controller.rebind();
  }

  disposeAll(): void {
    for (const controller of [...this.controllers.values()]) controller.dispose();
    this.controllers.clear();
    this.unread.clear();
    this.host.onChange();
  }

  private markUnread(sessionId: string): void {
    this.unread.add(sessionId);
    this.host.onChange();
  }

  private clearUnread(sessionId: string): void {
    if (!this.unread.delete(sessionId)) return;
    this.host.onChange();
  }
}
