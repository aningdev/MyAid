/**
 * Deep module: claimed Session lifecycle — one shared Connection, and the
 * create + claim path that binds a Harness Session to a Dialogue.
 * Following a Session and running its turns belong to its SessionController.
 */
import type { PromptContentPart, SessionFollowFrame } from "@myaid/dsh-web-protocol/session";

import type {
  ApprovalDecision,
  ApprovalRequest,
  BotPresetDeriveRequest,
  BotPresetDeriveResult,
  BotPresetRecord,
  BotPresetRemoveResult,
  BotPresetUpdateRequest,
  CommandOutcome,
  FlatModelCatalog,
  InventoryEntry,
  InventoryPreset,
  SessionUsage,
  SkillSummary,
} from "../../../lib/dsh/connection";
import { claimOwner, type Bot, type BotRegistry, type Dialogue } from "../../bots/model";
import { sessionLabel, workspaceKey } from "../../bots/sessions";

export type { ApprovalDecision, ApprovalRequest, FlatModelCatalog };
export type { CommandOutcome, InventoryEntry, InventoryPreset, SessionUsage, SkillSummary };
/** @deprecated Prefer {@link FlatModelCatalog}. */
export type ModelCatalog = FlatModelCatalog;

/** Minimal transport the claim / follow modules need from a Connection adapter. */
export type SessionTransport = {
  ready: boolean;
  createSession(request: {
    cwd?: string;
    agentPreset?: string;
    sessionId?: string;
  }): Promise<{ sessionId: string }>;
  /** `running` is Host-reported Agent state, present for Sessions not followed here too. */
  listSessions(): Promise<
    {
      sessionId: string;
      blank: boolean;
      updatedAt: number;
      running?: boolean;
      cwd?: string;
    }[]
  >;
  follow(
    sessionId: string,
    onFrame: (frame: SessionFollowFrame) => void,
    onError?: (error: Error) => void,
  ): () => void;
  /** One page of durable history before `beforeSeq` (`session.events`). */
  sessionPage(request: {
    sessionId: string;
    beforeSeq: number;
  }): Promise<{ records: unknown[]; hasMore: boolean }>;
  /** Prompts still waiting in the live Agent's inbox (`session.state`). */
  sessionQueue(sessionId: string): Promise<QueuedItem[]>;
  prompt(request: {
    sessionId: string;
    requestId: string;
    text?: string;
    content?: readonly PromptContentPart[];
  }): Promise<void>;
  cancel(sessionId: string): Promise<void>;
  /** Withdraw a still-pending queued prompt (`session.updateQueue` remove). */
  withdrawQueuedPrompt(sessionId: string, itemId: string): Promise<void>;
  /** The Session's own title, in dsh (`session.rename`). */
  renameSession(sessionId: string, title: string): Promise<void>;
  /** Stage a file's bytes; a prompt then names its receipt. */
  uploadFile(request: {
    sessionId: string;
    data: string;
    name?: string;
  }): Promise<{ receiptId: string }>;
  modelCatalog(): Promise<FlatModelCatalog>;
  selectModel(request: {
    sessionId: string;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }): Promise<void>;
  selectAgentPreset(sessionId: string, agentPreset: string): Promise<string>;
  /** Context occupancy and token totals of one Session (`session.projections`). */
  sessionUsage?(sessionId: string): Promise<SessionUsage>;
  /** One slash command (the Inspector's Compact runs `/compact`). */
  executeCommand?(sessionId: string, line: string): Promise<CommandOutcome>;
  /** The user-invocable skills of one Session's composition (`skills.list`). */
  listSkills?(sessionId: string): Promise<SkillSummary[]>;
  /** Loader plugins and every preset's composition (`pluginInventory.list`). */
  pluginInventory?(): Promise<{
    entries: InventoryEntry[];
    presets: InventoryPreset[];
    managementAvailable: boolean;
  }>;
  /** Derived Bot presets (`myaidBotPresets`), when the Host plugin is loaded. */
  botPresets?: {
    derive(request: BotPresetDeriveRequest): Promise<BotPresetDeriveResult>;
    read(presetId: string): Promise<BotPresetRecord>;
    update(presetId: string, patch: BotPresetUpdateRequest): Promise<BotPresetRecord>;
    discard(presetId: string): Promise<BotPresetRemoveResult>;
  };
  /** Whether the Host can hand a path to the desktop's file manager. */
  canReveal?(): Promise<boolean>;
  /** Show a path in the Finder (`session.openWorkspacePath`, action `reveal`). */
  revealPath?(path: string): Promise<void>;
  approvals(handler: (request: ApprovalRequest) => Promise<ApprovalDecision>): void;
  dispose(): Promise<void>;
};

/** One prompt waiting in a live Agent's inbox. */
export type QueuedItem = {
  /** The item's message id, what `session.updateQueue` takes. */
  id: string;
  /** The `requestId` the Client minted when it sent the prompt, when dsh kept it. */
  requestId?: string;
  text: string;
};

export type ClaimHooks = {
  connect(): Promise<SessionTransport>;
  claim(dialogueId: string, sessionId: string): Promise<boolean>;
  registry(): BotRegistry;
};

/**
 * Same-workspace guard used before a prompt: two Sessions may run side by
 * side, but two in one workspace would fight over it.
 */
export function occupancyBlock(input: {
  occupyingSessionIds: readonly string[];
  targetSessionId: string;
  registry: BotRegistry;
  summaries: Map<string, string>;
}): string | null {
  const right = claimOwner(input.registry, input.targetSessionId);
  if (!right) return null;
  for (const occupant of input.occupyingSessionIds) {
    if (occupant === input.targetSessionId) continue;
    const left = claimOwner(input.registry, occupant);
    if (!left) continue;
    if (workspaceKey(left.dialogue.workspacePath) !== workspaceKey(right.dialogue.workspacePath)) {
      continue;
    }
    return `工作区正被「${sessionLabel(left.claim, input.summaries.get(occupant) ?? null)}」占用。`;
  }
  return null;
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

/** Owns the one shared Connection and claims created Sessions to a Dialogue. */
export class ClaimedSessionClient {
  private transport: SessionTransport | undefined;
  private connectLock: Promise<void> | undefined;
  disposed = false;

  constructor(private readonly hooks: ClaimHooks) {}

  getTransport(): SessionTransport | undefined {
    return this.transport;
  }

  async ensureConnected(): Promise<SessionTransport> {
    this.assertAlive();
    if (this.transport?.ready) return this.transport;
    if (this.connectLock) {
      await this.connectLock;
      if (this.transport?.ready) return this.transport as SessionTransport;
    }
    const work = (async () => {
      if (this.transport) await this.transport.dispose().catch(() => undefined);
      this.transport = await this.hooks.connect();
    })();
    // Callers of a second, concurrent connect await this; its failure reaches
    // them through `work` (`await work` below), so it must not go unhandled.
    this.connectLock = work
      .finally(() => {
        this.connectLock = undefined;
      })
      .catch(() => undefined);
    await work;
    if (!this.transport?.ready) throw new Error("尚未连接后台");
    return this.transport;
  }

  /** Create the Harness Session, claim it to the Dialogue. Following starts per SessionController. */
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
    return created.sessionId;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const transport = this.transport;
    this.transport = undefined;
    if (transport) await transport.dispose().catch(() => undefined);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("ClaimedSession 已释放");
  }
}
