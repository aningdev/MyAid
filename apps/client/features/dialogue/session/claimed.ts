/**
 * Deep module: claimed Session lifecycle (connect → create+claim+follow → prompt → dispose).
 * Sessions are claimed to a Dialogue; Bot supplies the Agent preset.
 */
import type { PromptContentPart, SessionFollowFrame } from "@myaid/dsh-web-protocol/session";

import type {
  ApprovalDecision,
  ApprovalRequest,
  FlatModelCatalog,
} from "../../../lib/dsh/connection";
import { claimOwner, type Bot, type BotRegistry, type Dialogue } from "../../bots/model";
import { sessionLabel, workspaceKey } from "../../bots/sessions";

export type { ApprovalDecision, ApprovalRequest, FlatModelCatalog };
/** @deprecated Prefer {@link FlatModelCatalog}. */
export type ModelCatalog = FlatModelCatalog;

/** Minimal transport the ClaimedSession module needs from a Connection adapter. */
export type SessionTransport = {
  ready: boolean;
  createSession(request: {
    cwd?: string;
    agentPreset?: string;
    sessionId?: string;
  }): Promise<{ sessionId: string }>;
  listSessions(): Promise<{ sessionId: string; blank: boolean; updatedAt: number }[]>;
  follow(
    sessionId: string,
    onFrame: (frame: SessionFollowFrame) => void,
    onError?: (error: Error) => void,
  ): () => void;
  prompt(request: {
    sessionId: string;
    requestId: string;
    text?: string;
    content?: readonly PromptContentPart[];
  }): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  /** Withdraw a still-pending queued prompt (`session.updateQueue` remove). */
  withdrawQueuedPrompt(sessionId: string, itemId: string): Promise<void>;
  modelCatalog(): Promise<FlatModelCatalog>;
  selectModel(request: { sessionId: string; provider: string; model: string }): Promise<void>;
  selectAgentPreset(sessionId: string, agentPreset: string): Promise<string>;
  approvals(handler: (request: ApprovalRequest) => Promise<ApprovalDecision>): void;
  dispose(): Promise<void>;
};

export type ClaimHooks = {
  connect(): Promise<SessionTransport>;
  claim(dialogueId: string, sessionId: string): Promise<boolean>;
  registry(): BotRegistry;
  summaries(): Map<string, string>;
  onFrame(sessionId: string, frame: SessionFollowFrame): void;
  onFollowError(error: Error): void;
};

export function occupancyBlock(input: {
  occupyingSessionId: string | null;
  targetSessionId: string;
  registry: BotRegistry;
  summaries: Map<string, string>;
}): string | null {
  const occupant = input.occupyingSessionId;
  if (!occupant || occupant === input.targetSessionId) return null;
  const left = claimOwner(input.registry, occupant);
  const right = claimOwner(input.registry, input.targetSessionId);
  if (!left || !right) return null;
  if (workspaceKey(left.dialogue.workspacePath) !== workspaceKey(right.dialogue.workspacePath)) {
    return null;
  }
  return `工作区正被「${sessionLabel(left.claim, input.summaries.get(occupant) ?? null)}」占用。`;
}

export async function resolveBotModel(
  catalog: FlatModelCatalog,
  want: string | null | undefined,
): Promise<{ provider: string; model: string } | null> {
  const trimmed = want?.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  if (slash > 0) {
    return { provider: trimmed.slice(0, slash), model: trimmed.slice(slash + 1) };
  }
  const hits = catalog.models.filter((item) => item.model === trimmed || item.name === trimmed);
  const hit = hits.length === 1 ? hits[0] : undefined;
  return hit ? { provider: hit.provider, model: hit.model } : null;
}

/** Owns one Connection + followed claimed Session. */
export class ClaimedSessionClient {
  private transport: SessionTransport | undefined;
  private sessionId: string | undefined;
  private followStop: (() => void) | undefined;
  private connectLock: Promise<void> | undefined;
  occupyingSessionId: string | null = null;
  disposed = false;

  constructor(private readonly hooks: ClaimHooks) {}

  getTransport(): SessionTransport | undefined {
    return this.transport;
  }

  currentSessionId(): string | undefined {
    return this.sessionId;
  }

  async ensureConnected(): Promise<SessionTransport> {
    this.assertAlive();
    if (this.transport?.ready) return this.transport;
    if (this.connectLock) {
      await this.connectLock;
      if (this.transport?.ready) return this.transport;
    }
    const work = (async () => {
      if (this.transport) await this.transport.dispose().catch(() => undefined);
      this.transport = await this.hooks.connect();
    })();
    this.connectLock = work.finally(() => {
      this.connectLock = undefined;
    });
    await work;
    if (!this.transport?.ready) throw new Error("尚未连接后台");
    return this.transport;
  }

  installApprovalHandler(handler: (request: ApprovalRequest) => Promise<ApprovalDecision>): void {
    this.transport?.approvals(handler);
  }

  beginFollow(sessionId: string): void {
    this.assertAlive();
    const transport = this.transport;
    if (!transport?.ready) throw new Error("尚未连接后台");
    this.followStop?.();
    this.sessionId = sessionId;
    this.followStop = transport.follow(
      sessionId,
      (frame) => this.hooks.onFrame(sessionId, frame),
      (error) => this.hooks.onFollowError(error),
    );
  }

  stopFollow(): void {
    this.followStop?.();
    this.followStop = undefined;
    this.sessionId = undefined;
  }

  /** Create Harness Session, claim to Dialogue, follow. */
  async createClaimed(input: {
    dialogueId: string;
    dialogue: Dialogue;
    bot: Bot;
    agentPreset: string;
  }): Promise<string> {
    this.assertAlive();
    const transport = await this.ensureConnected();
    const created = await transport.createSession({
      cwd: input.dialogue.workspacePath,
      agentPreset: input.agentPreset,
    });
    const saved = await this.hooks.claim(input.dialogueId, created.sessionId);
    if (!saved) throw new Error("会话已在后台创建，但没有写入这段 Dialogue。");
    this.beginFollow(created.sessionId);
    return created.sessionId;
  }

  async openClaimed(sessionId: string, missing: boolean): Promise<void> {
    this.assertAlive();
    if (missing) throw new Error("这条会话待核对，dsh 里已经没有它。");
    await this.ensureConnected();
    this.beginFollow(sessionId);
  }

  async prompt(input: {
    sessionId: string;
    text: string;
    bot: Bot;
    archived: boolean;
    content?: readonly PromptContentPart[];
  }): Promise<string> {
    this.assertAlive();
    if (input.archived) throw new Error("这段 Dialogue 已归档，不能继续输入。");
    const blocked = occupancyBlock({
      occupyingSessionId: this.occupyingSessionId,
      targetSessionId: input.sessionId,
      registry: this.hooks.registry(),
      summaries: this.hooks.summaries(),
    });
    if (blocked) throw new Error(blocked);
    let transport = this.transport;
    if (!transport?.ready) {
      await this.openClaimed(input.sessionId, false);
      transport = this.transport;
    }
    if (!transport) throw new Error("尚未连接后台");
    try {
      const catalog = await transport.modelCatalog();
      const selected = await resolveBotModel(catalog, input.bot.defaultModel);
      if (selected) {
        await transport.selectModel({
          sessionId: input.sessionId,
          provider: selected.provider,
          model: selected.model,
        });
      }
    } catch {
      // Model apply is best-effort; prompt still proceeds.
    }
    const requestId = crypto.randomUUID().replace(/-/g, "");
    await transport.prompt({
      sessionId: input.sessionId,
      requestId,
      ...(input.content ? { content: input.content } : { text: input.text }),
    });
    return requestId;
  }

  async cancel(): Promise<void> {
    const transport = this.transport;
    const sessionId = this.sessionId;
    if (!transport?.ready || !sessionId) return;
    await transport.cancel(sessionId);
  }

  /** Withdraw one queued (not yet running) prompt by message id. */
  async withdrawQueued(itemId: string): Promise<void> {
    const transport = this.transport;
    const sessionId = this.sessionId;
    if (!transport?.ready || !sessionId) return;
    await transport.withdrawQueuedPrompt(sessionId, itemId);
  }

  async selectPreset(agentPreset: string): Promise<string | undefined> {
    const transport = this.transport;
    const sessionId = this.sessionId;
    if (!transport?.ready || !sessionId) return undefined;
    return transport.selectAgentPreset(sessionId, agentPreset);
  }

  noteActivity(sessionId: string, running: boolean): void {
    if (running) this.occupyingSessionId = sessionId;
    else if (this.occupyingSessionId === sessionId) this.occupyingSessionId = null;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.followStop?.();
    this.followStop = undefined;
    this.sessionId = undefined;
    this.occupyingSessionId = null;
    const transport = this.transport;
    this.transport = undefined;
    if (transport) await transport.dispose().catch(() => undefined);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("ClaimedSession 已释放");
  }
}
