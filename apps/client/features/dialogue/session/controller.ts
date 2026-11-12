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
  occupancyBlock,
  resolveBotModel,
  type ApprovalDecision,
  type ApprovalRequest,
  type SessionTransport,
} from "./claimed";
import type { SessionStatus } from "./roster";
import { TurnProjection, type TurnView } from "./turn";

export type { ApprovalDecision, ApprovalRequest };

function emptyView(): TurnView {
  return {
    messages: [],
    running: false,
    status: "",
    liveMd: "",
    liveReason: "",
    liveTools: [],
    liveId: null,
    pendingFreeze: null,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  readonly draft = signal("");
  readonly error = signal<string | null>(null);
  readonly running = signal(false);
  readonly pendingApproval = signal<ApprovalRequest | null>(null);

  private turns = new TurnProjection();
  private followStop: (() => void) | undefined;
  private followTransport: SessionTransport | undefined;
  private starting: Promise<void> | undefined;
  private mounts = 0;
  private prompting = false;
  private approvals: PendingApproval[] = [];
  private disposed = false;

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

  async cancel(): Promise<void> {
    const transport = this.host.transport();
    if (!transport?.ready) return;
    await transport.cancel(this.sessionId);
  }

  /** Withdraw one queued (not yet running) prompt by message id. */
  async withdrawQueued(itemId: string): Promise<void> {
    const transport = this.host.transport();
    if (!transport?.ready) return;
    await transport.withdrawQueuedPrompt(this.sessionId, itemId);
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
    if (wasRunning) this.finished();
    else this.maybeDispose();
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
