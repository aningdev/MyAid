/**
 * Deep module: one live Session per controller — its follow stream, its own
 * TurnProjection, its draft, approvals and error — plus the lazy registry that
 * keeps controllers for the Sessions Panels show and for replies still running
 * off-screen. The shared Connection belongs to ClaimedSession, not here.
 */
import type { PromptContentPart } from "@myaid/dsh-web-protocol/session";
import { signal, untracked } from "nsh";

import type { BotRegistry } from "../../bots/model";
import { claimOwner } from "../../bots/model";
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
  type SessionTransport,
} from "./claimed";
import type { SessionStatus } from "./roster";
import { TurnProjection, type TurnView } from "./turn";

export type { ApprovalDecision, ApprovalRequest, Attachment };

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

/**
 * A `session.follow` stream can end under a Client that did nothing wrong: the
 * dsh gateway pings every 2 s and terminates a peer that misses two pongs, and
 * NSH's standard `websocket` stops reading the network while eight messages
 * wait unread — a long render between reads (a large reply, a slow frame) makes
 * the socket look dead. The Host's connection reconnects by itself; the follow
 * stream does not, so it is re-opened here: three tries, 300 ms doubling.
 */
const FOLLOW_RETRIES = 3;
const FOLLOW_RETRY_BASE_MS = 300;
const FOLLOW_RETRY_MAX_MS = 4_000;

/** What a SessionController needs from the product runtime. */
export type SessionControllerHost = {
  /** Shared Connection, connected on demand. */
  ensureTransport(): Promise<SessionTransport>;
  transport(): SessionTransport | undefined;
  registry(): BotRegistry;
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
 * One followed Session. Created lazily by SessionRegistry and disposed once
 * no Panel shows it and it is neither running nor waiting on approval.
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
  private followStop: (() => void) | undefined;
  private followTransport: SessionTransport | undefined;
  private starting: Promise<void> | undefined;
  private mounts = 0;
  private prompting = false;
  private approvals: PendingApproval[] = [];
  private disposed = false;
  private followRetry: ReturnType<typeof setTimeout> | undefined;
  private followRetries = 0;

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

  /** A Panel now shows this Session. Clears unread; starts following when needed. */
  mount(): void {
    if (this.disposed) return;
    this.mounts += 1;
    this.host.onShown(this.sessionId);
    void this.start();
  }

  /** The Panel stopped showing it; idle controllers leave at once, running ones stay. */
  unmount(): void {
    if (this.mounts > 0) this.mounts -= 1;
    this.maybeDispose();
  }

  /** Connect if needed and follow this Session (snapshot + live frames). */
  async start(): Promise<void> {
    if (this.disposed) return;
    if (this.starting) return this.starting;
    const work = (async () => {
      try {
        this.error.set(null);
        const transport = await this.host.ensureTransport();
        if (this.disposed) return;
        if (!transport.ready) throw new Error("尚未连接后台");
        this.ensureFollow(transport);
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

  /** Read one page of history above the follow window (`session.events`). */
  async loadOlder(): Promise<void> {
    if (this.disposed || untracked(this.olderLoading)) return;
    if (!untracked(this.view).olderHasMore) return;
    const first = this.turns.firstSeq();
    if (first === null) return;
    this.olderLoading.set(true);
    try {
      const transport = await this.ensureTransport();
      const page = await transport.sessionPage({ sessionId: this.sessionId, beforeSeq: first });
      this.publish(this.turns.prepend(page.records, page.hasMore));
    } catch (error) {
      this.error.set(messageOf(error));
    } finally {
      this.olderLoading.set(false);
    }
  }

  /** A prompt sent while a turn runs: dsh queues it; it never begins a local turn. */
  async queuePrompt(text: string, content?: readonly PromptContentPart[]): Promise<void> {
    if (this.disposed) throw new Error("这条会话的运行时已释放。");
    const transport = await this.ensureTransport();
    const requestId = crypto.randomUUID().replace(/-/g, "");
    await transport.prompt({
      sessionId: this.sessionId,
      requestId,
      ...(content ? { content } : { text }),
    });
    this.queued.set([...this.queued(), { requestId, itemId: null, text }]);
    void this.refreshQueue();
  }

  /** The live Agent's inbox, as `session.state` reports it. */
  async refreshQueue(): Promise<void> {
    const transport = this.host.transport();
    if (this.disposed || !transport?.ready) return;
    try {
      const items = await transport.sessionQueue(this.sessionId);
      const pending: QueuedPrompt[] = items.map((item) => ({
        requestId: item.requestId ?? item.id,
        itemId: item.id,
        text: item.text,
      }));
      // Entries dsh has not listed yet stay (a prompt can outrun the next read).
      const unresolved = this.queued().filter(
        (mine) =>
          mine.itemId === null &&
          !pending.some((item) => item.requestId === mine.requestId || item.text === mine.text),
      );
      this.queued.set([...pending, ...unresolved]);
    } catch {
      // A cold Session has no readable queue; the local entries stay.
    }
  }

  /** Takes a queued prompt back out of the Agent's inbox. */
  async withdrawQueued(requestId: string): Promise<void> {
    const entry = this.queued().find((item) => item.requestId === requestId);
    if (!entry) return;
    this.queued.set(this.queued().filter((item) => item.requestId !== requestId));
    const transport = this.host.transport();
    if (!transport?.ready) return;
    try {
      let itemId = entry.itemId;
      if (!itemId) {
        const items = await transport.sessionQueue(this.sessionId);
        itemId =
          items.find((item) => item.requestId === requestId || item.text === entry.text)?.id ??
          null;
      }
      if (!itemId) {
        this.error.set("这条消息已经被后台接收，不能再撤回。");
        return;
      }
      await transport.withdrawQueuedPrompt(this.sessionId, itemId);
    } catch (error) {
      this.error.set(messageOf(error));
    }
    void this.refreshQueue();
  }

  /** Send a prompt through the shared Connection; the local bubble is begun by the Pane. */
  async prompt(text: string, content?: readonly PromptContentPart[]): Promise<string> {
    if (this.disposed) throw new Error("这条会话的运行时已释放。");
    const owner = claimOwner(this.host.registry(), this.sessionId);
    if (!owner) throw new Error("这条会话还没有认领到 Dialogue。");
    if (owner.dialogue.archived) throw new Error("这段 Dialogue 已归档，不能继续输入。");
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
      const transport = await this.ensureTransport();
      try {
        const catalog = await transport.modelCatalog();
        const selected = await resolveBotModel(catalog, owner.bot.defaultModel);
        if (selected) {
          await transport.selectModel({
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
      await transport.prompt({
        sessionId: this.sessionId,
        requestId,
        ...(content ? { content } : { text }),
      });
      return requestId;
    } catch (error) {
      this.applyError(messageOf(error));
      throw error;
    }
  }

  /** Stages a file's bytes; the prompt then names the receipt. */
  async uploadFile(name: string, data: string): Promise<string> {
    const transport = await this.ensureTransport();
    const receipt = await transport.uploadFile({ sessionId: this.sessionId, data, name });
    return receipt.receiptId;
  }

  async cancel(): Promise<void> {
    const transport = this.host.transport();
    if (!transport?.ready) return;
    await transport.cancel(this.sessionId);
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

  /** Generation went down: keep the error, stop folding frames into a dead view. */
  connectionLost(): void {
    this.stopFollow();
    this.clearApprovals();
    this.prompting = false;
    if (untracked(this.running)) {
      this.running.set(false);
      this.view.set({ ...untracked(this.view), running: false });
      this.host.onStatusChange(this.sessionId);
    }
    if (!this.disposed) this.error.set("后台连接已断开。");
    this.maybeDispose();
  }

  /** A new Host generation is ready: Panels that still show this Session re-follow. */
  connectionRestored(): void {
    if (this.disposed) return;
    if (this.mounts > 0 || this.busy) void this.start();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelFollowRetry();
    this.stopFollow();
    this.clearApprovals();
    this.host.onDispose(this.sessionId);
  }

  private clearApprovals(): void {
    for (const entry of this.approvals) {
      entry.detach?.();
      entry.resolve("cancelled");
    }
    if (this.approvals.length === 0 && untracked(this.pendingApproval) === null) return;
    this.approvals = [];
    this.pendingApproval.set(null);
    this.host.onStatusChange(this.sessionId);
  }

  private async ensureTransport(): Promise<SessionTransport> {
    const transport = await this.host.ensureTransport();
    if (!transport.ready) throw new Error("尚未连接后台");
    if (!this.disposed) this.ensureFollow(transport);
    return transport;
  }

  /** One follow per transport; a reconnect replaces the stale stream. */
  private ensureFollow(transport: SessionTransport): void {
    if (this.followStop && this.followTransport === transport) return;
    this.stopFollow();
    this.followTransport = transport;
    this.followStop = transport.follow(
      this.sessionId,
      (frame) => this.receive(frame),
      (error) => this.followFailed(error),
    );
  }

  private receive(frame: Parameters<TurnProjection["receive"]>[0]): void {
    const wasRunning = untracked(this.running);
    // A frame proves the stream serves this Session again: the retries start over.
    this.followRetries = 0;
    const view = this.turns.receive(frame);
    this.publish(view);
    this.host.onView(this.sessionId, view);
    if (wasRunning && !view.running) this.finished();
  }

  private publish(view: TurnView): void {
    this.view.set(view);
    if (view.running !== untracked(this.running)) {
      this.running.set(view.running);
      this.host.onStatusChange(this.sessionId);
      // The inbox drains as the turn takes its next prompt.
      void this.refreshQueue();
    }
  }

  private finished(): void {
    this.prompting = false;
    if (this.mounts === 0) this.host.onFinishedHidden(this.sessionId);
    this.maybeDispose();
  }

  private followFailed(error: Error): void {
    this.stopFollow();
    if (this.disposed) return;
    this.prompting = false;
    const wasRunning = untracked(this.running);
    if (wasRunning) {
      this.running.set(false);
      this.view.set({ ...untracked(this.view), running: false });
      this.host.onStatusChange(this.sessionId);
    }
    this.error.set(error.message);
    this.scheduleFollowRetry();
    if (wasRunning) this.finished();
    else this.maybeDispose();
  }

  /**
   * Re-open a failed follow stream for a Session still worth following (a Panel
   * shows it, or its turn runs). The error stays visible until a frame lands.
   */
  private scheduleFollowRetry(): void {
    if (this.disposed || this.followRetry !== undefined) return;
    if (this.mounts === 0 && !untracked(this.running) && !this.prompting) return;
    this.followRetries += 1;
    if (this.followRetries > FOLLOW_RETRIES) return;
    const delay = Math.min(
      FOLLOW_RETRY_MAX_MS,
      FOLLOW_RETRY_BASE_MS * 2 ** (this.followRetries - 1),
    );
    this.followRetry = setTimeout(() => {
      this.followRetry = undefined;
      if (this.disposed) return;
      void this.start();
    }, delay);
  }

  private cancelFollowRetry(): void {
    if (this.followRetry === undefined) return;
    clearTimeout(this.followRetry);
    this.followRetry = undefined;
  }

  private fail(message: string): void {
    if (this.disposed) return;
    this.error.set(message);
    this.prompting = false;
    this.maybeDispose();
  }

  private stopFollow(): void {
    const stop = this.followStop;
    this.followStop = undefined;
    this.followTransport = undefined;
    stop?.();
  }

  private publishApproval(): void {
    this.pendingApproval.set(this.approvals[0]?.request ?? null);
    if (!this.disposed) this.host.onStatusChange(this.sessionId);
  }

  private maybeDispose(): void {
    if (this.disposed || this.mounts > 0) return;
    if (untracked(this.running) || this.prompting || this.approvals.length > 0) return;
    // A draft belongs to the Session: its controller stays until it is sent or
    // emptied, so switching Panels never loses what was written.
    if (untracked(this.draft).length > 0 || untracked(this.draftAttachments).length > 0) return;
    this.dispose();
  }
}

export type SessionRegistryHost = {
  ensureTransport(): Promise<SessionTransport>;
  transport(): SessionTransport | undefined;
  registry(): BotRegistry;
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
      ensureTransport: () => this.host.ensureTransport(),
      transport: () => this.host.transport(),
      registry: () => this.host.registry(),
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

  connectionLost(): void {
    for (const controller of [...this.controllers.values()]) controller.connectionLost();
  }

  connectionRestored(): void {
    for (const controller of [...this.controllers.values()]) controller.connectionRestored();
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
