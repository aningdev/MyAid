/**
 * Deep module: claimed Session lifecycle — one shared Connection, and the
 * create + claim path that appends a Harness Session as a Bot segment.
 *
 * Following a Session, its history window, its paging and its prompt/queue
 * state belong to the official Client model (`ctx.sessions`); a
 * SessionController reads that model and keeps only product state.
 */
import type { ISessions, IWorkspaces } from "@myaid/dsh-web-protocol/client";

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
import { t } from "../../../lib/i18n";
import { segmentOwner, type BotRegistry } from "../../bots/model";
import { sessionLabel } from "../../bots/sessions";

export type { ApprovalDecision, ApprovalRequest, FlatModelCatalog };
export type { CommandOutcome, InventoryEntry, InventoryPreset, SessionUsage, SkillSummary };
/** @deprecated Prefer {@link FlatModelCatalog}. */
export type ModelCatalog = FlatModelCatalog;

/**
 * What a Controller needs from the shared Connection: the official Client
 * models, plus the Remote commands the official model does not own.
 */
export type SessionHost = {
  ready: boolean;
  /** Official Session model: list, retain, create, projections. */
  sessions: ISessions;
  /** Official Workspace model: rows, order, archive set, pins. */
  workspaces: IWorkspaces;
  createSession(request: {
    /** The dsh Workspace the Session joins; the Host attaches it after create. */
    workspaceId?: string;
    cwd?: string;
    agentPreset?: string;
    sessionId?: string;
  }): Promise<{ sessionId: string }>;
  modelCatalog(): Promise<FlatModelCatalog>;
  selectModel(request: {
    sessionId: string;
    provider: string;
    model: string;
    reasoningEffort?: string;
  }): Promise<void>;
  selectAgentPreset(sessionId: string, agentPreset: string): Promise<string>;
  /** The Session's own title, in dsh (`session.rename`). */
  renameSession(sessionId: string, title: string): Promise<void>;
  /** Stage a file's bytes; a prompt then names its receipt. */
  uploadFile(request: {
    sessionId: string;
    data: string;
    name?: string;
  }): Promise<{ receiptId: string }>;
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
  /** Derived Bot presets (`botPresets`), when the Host plugin is loaded. */
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

export type ClaimHooks = {
  connect(): Promise<SessionHost>;
  claim(botId: string, workspaceId: string, sessionId: string): Promise<boolean>;
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
  const right = segmentOwner(input.registry, input.targetSessionId);
  if (!right) return null;
  for (const occupant of input.occupyingSessionIds) {
    if (occupant === input.targetSessionId) continue;
    const left = segmentOwner(input.registry, occupant);
    if (!left) continue;
    if (left.segment.workspaceId !== right.segment.workspaceId) continue;
    return t("session.workspaceOccupied", {
      label: sessionLabel(left.segment, input.summaries.get(occupant) ?? null),
    });
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

/** Owns the one shared Connection and claims created Sessions as a Bot's next segment. */
export class ClaimedSessionClient {
  private host: SessionHost | undefined;
  private connectLock: Promise<void> | undefined;
  disposed = false;

  constructor(private readonly hooks: ClaimHooks) {}

  getHost(): SessionHost | undefined {
    return this.host;
  }

  async ensureConnected(): Promise<SessionHost> {
    this.assertAlive();
    if (this.host?.ready) return this.host;
    if (this.connectLock) {
      await this.connectLock;
      if (this.host?.ready) return this.host as SessionHost;
    }
    const work = (async () => {
      if (this.host) await this.host.dispose().catch(() => undefined);
      this.host = await this.hooks.connect();
    })();
    // Callers of a second, concurrent connect await this; its failure reaches
    // them through `work` (`await work` below), so it must not go unhandled.
    this.connectLock = work
      .finally(() => {
        this.connectLock = undefined;
      })
      .catch(() => undefined);
    await work;
    if (!this.host?.ready) throw new Error(t("session.hostDown"));
    return this.host;
  }

  /**
   * Create the Harness Session in the segment's Workspace, then claim it.
   * `session.create({ workspaceId })` is dsh's own create-then-attach: the
   * Workspace records the new Session before this call returns.
   */
  async createClaimed(input: {
    botId: string;
    workspaceId: string;
    agentPreset: string;
  }): Promise<string> {
    this.assertAlive();
    const host = await this.ensureConnected();
    const created = await host.createSession({
      workspaceId: input.workspaceId,
      agentPreset: input.agentPreset,
    });
    const saved = await this.hooks.claim(input.botId, input.workspaceId, created.sessionId);
    if (!saved) throw new Error(t("session.claimLost"));
    return created.sessionId;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const host = this.host;
    this.host = undefined;
    if (host) await host.dispose().catch(() => undefined);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error(t("session.claimReleased"));
  }
}
