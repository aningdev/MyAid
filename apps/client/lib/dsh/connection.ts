/**
 * Official `dsh web` protocol client: cookie bootstrap, Gateway, Session Remote.
 * No product workbench UI.
 */
import type {
  BotPresetDeriveRequest,
  BotPresetDeriveResult,
  BotPresetRecord,
  BotPresetRemoveResult,
  BotPresetUpdateRequest,
} from "@myaid/dsh-web-protocol/bot-presets";
import type { ApprovalOutcome, ApprovalRequestEvent } from "@myaid/dsh-web-protocol/interaction";
import type { PluginInfo } from "@myaid/dsh-web-protocol/plugins";
import type {
  ImageAttachmentRef,
  ModelCatalog as OfficialModelCatalog,
  PromptContentPart,
  SessionAttachmentValue,
  SessionCreateRequest,
  SessionFollowFrame,
  SessionPageRequest,
  SessionProjectionsValue,
  SessionProjectionsRequest,
  SessionRenameRequest,
  SessionStateRequest,
  SessionUpdateQueueRequest,
} from "@myaid/dsh-web-protocol/session";
import type { SettingsDescribeValue } from "@myaid/dsh-web-protocol/settings";

export type {
  BotPresetDeriveRequest,
  BotPresetDeriveResult,
  BotPresetRecord,
  BotPresetRemoveResult,
  BotPresetSkill,
  BotPresetUpdateRequest,
} from "@myaid/dsh-web-protocol/bot-presets";
import { fetchSessionCookie } from "./auth";
// Bun-prepared Node-condition bundle (`bun run prepare:sdk` → `sdk.js`).
import {
  Context,
  Gateway,
  TypertRegistry,
  agentPresetsRemote,
  botPresetsRemote,
  commandsRemote,
  fileUploadsRemote,
  installConnection,
  pluginInventoryRemote,
  pluginManagerRemote,
  sessionRemote,
  settingsRemote,
  workspaceRemote,
} from "./sdk.js";
import { AuthenticatedSocket } from "./socket";

export type AgentPresetSummary = {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  broken?: string;
};

export type AgentPresetDetail = {
  agentPreset: string;
  content: string;
  name?: string;
  description?: string;
};

/** Official approval outcome vocabulary. */
export type ApprovalDecision = ApprovalOutcome;

/**
 * Product UI approval prompt (session-scoped, display-ready).
 * Distinct from official `ApprovalRequest` / `ApprovalRequestEvent` on the wire.
 */
export type ApprovalRequest = {
  sessionId: string;
  toolName: string;
  callId?: string;
  reason: string;
  details: string;
  signal?: AbortSignal;
};

/** One flattened catalog row for product pickers (official wire keeps `groups`). */
export type FlatCatalogModel = {
  provider: string;
  providerName: string;
  model: string;
  name: string;
  description?: string;
  /** Reasoning levels this route offers (Bot Settings › Runs with). Absent: none. */
  thinking?: ThinkingLevel[];
  /** The route's own default level, when it publishes one. */
  defaultThinking?: string;
};

/** Product view of {@link OfficialModelCatalog} with groups flattened to `models`. */
export type FlatModelCatalog = {
  default: { provider: string; model: string };
  models: FlatCatalogModel[];
  failures: { name: string; message: string }[];
};

/** One reasoning level a model offers (Bot Settings › Runs with). */
export type ThinkingLevel = { id: string; name: string; description?: string };

/** One dsh skill visible to a Session's composition (`skills.list`). */
export type SkillSummary = {
  name: string;
  description: string;
  whenToUse?: string;
  modelInvocable: boolean;
  path?: string;
};

/** A preset's plugin rows, as `pluginInventory.list` reports them. */
export type InventoryPreset = {
  id: string;
  name?: string;
  isDefault: boolean;
  broken?: string;
  rows: readonly {
    entryId: string | null;
    moduleName: string;
    name?: string;
    enabled: boolean | "conditional";
    fiberPhase: string | null;
    condition?: string;
    diagnostic?: string;
  }[];
};

/** Profile plugin entries the inventory lists beside the preset compositions. */
export type InventoryEntry = {
  entryId: string;
  moduleName: string;
  name?: string;
  enabled: boolean;
  fiberPhase: string | null;
};

/** Context occupancy and token totals of one Session (`session.projections`). */
export type SessionUsage = {
  /** The model's context window, when a request reported it. */
  contextWindow?: number;
  /** Provider-reported prompt-side tokens of the newest request. */
  pressureTokens?: number;
  /** Pressure plus the surface's movement since that sample (after a compaction). */
  projectedTokens?: number;
  tokens?: {
    uncachedInputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

/** One settled `/command` execution as the Inspector shows it. */
export type CommandOutcome = { kind: "success" | "error"; text?: string };

/** @deprecated Use {@link FlatCatalogModel}. */
export type CatalogModel = FlatCatalogModel;
/** @deprecated Use {@link FlatModelCatalog}. */
export type ModelCatalog = FlatModelCatalog;

export function flattenModelCatalog(value: OfficialModelCatalog): FlatModelCatalog {
  return {
    default: { provider: value.default.provider, model: value.default.model },
    models: value.groups.flatMap((group) =>
      group.models.map((model) => ({
        provider: group.id,
        providerName: group.name,
        model: model.id,
        name: model.name,
        ...(model.description ? { description: model.description } : {}),
        ...(model.reasoning && model.reasoning.efforts.length > 0
          ? {
              thinking: model.reasoning.efforts.map((effort) => ({
                id: effort.id,
                name: effort.name,
                ...(effort.description ? { description: effort.description } : {}),
              })),
            }
          : {}),
        ...(model.reasoning?.defaultEffort
          ? { defaultThinking: model.reasoning.defaultEffort }
          : {}),
      })),
    ),
    failures: value.failures.map((failure) => ({
      name: failure.name,
      message: failure.message,
    })),
  };
}

const messages: Record<string, string> = {
  "session/provider-credentials-unavailable": "后台没有可用的模型凭据。",
  "session/provider-models-unavailable": "模型提供方暂时不可用，请检查端点与凭据。",
  "session/model-unavailable": "所选模型当前不可用。",
  "session/conflict": "该工作区已被另一个对话占用。",
  "session/writer-held": "该对话正被另一个客户端写入。",
  "session/agent-busy": "该对话正在执行，请稍后再操作。",
};

export function readableError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const match = /^([a-z0-9-]+\/[a-z0-9-]+):\s*(.*)$/.exec(raw.trim());
  if (match) {
    const known = messages[match[1]!];
    return match[2] ? `${known ?? match[1]}（${match[2]}）` : (known ?? raw);
  }
  if (/Failed to fetch|NetworkError|connection/i.test(raw)) return `连接后台失败：${raw}`;
  return raw;
}

function unwrap<T = unknown>(result: {
  ok?: boolean;
  value?: T;
  error?: { code?: string; message?: string };
}): T {
  if (!result || result.ok !== true) {
    const error = result?.error ?? { code: "unknown/error", message: String(result) };
    throw new Error(`${error.code}: ${error.message}`);
  }
  return result.value as T;
}

/** The text parts of one queue item's content, as dsh stores it. */
function queueText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      const block = item as { type?: unknown; text?: unknown };
      return block?.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .join("");
}

const agentTag = Symbol("myaid.agent");
function agentScope() {}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** The preset/inventory row's display name from its localized meta, when it published one. */
function localizedName(value: Record<string, unknown>): string | undefined {
  const meta = record(value.meta);
  for (const key of ["zh", "en"]) {
    const localized = record(meta[key]);
    if (typeof localized.name === "string" && localized.name) return localized.name;
  }
  return typeof meta.name === "string" && meta.name ? meta.name : undefined;
}

type Scope = {
  ctx: unknown;
  dispose(): Promise<void> | void;
};

export class Connection {
  private epoch = 0;
  private connecting?: AbortController;
  private generationSubscription?: () => void;
  private ctx?: {
    remote: any;
    connection: any;
    fiber: { dispose(): Promise<void> };
    plugin: Function;
    typert: any;
  };
  private scopes = new Map<string, Scope>();
  private approval?: (request: ApprovalRequest) => Promise<ApprovalDecision>;
  ready = false;
  origin = "";

  onGenerationChange?: (ready: boolean) => void;

  /** Without a handler, approvals fail closed (`unavailable`). */
  approvals(handler: (request: ApprovalRequest) => Promise<ApprovalDecision>): void {
    this.approval = handler;
  }

  async connect(loginUrl: string): Promise<void> {
    if (this.ctx) throw new Error("已经连接后台");
    const epoch = ++this.epoch;
    const controller = new AbortController();
    this.connecting = controller;
    let login: { origin: string; cookie: string };
    try {
      login = await fetchSessionCookie(loginUrl, controller.signal);
    } catch (error) {
      const token = (() => {
        try {
          return new URL(loginUrl).searchParams.get("token") ?? "";
        } catch {
          return "";
        }
      })();
      const message = readableError(error);
      throw new Error(token ? message.replaceAll(token, "<已隐藏>") : message);
    }
    if (epoch !== this.epoch) throw new Error("连接已被新的宿主状态替代");
    const { origin, cookie } = login;

    const ctx: any = new Context();
    this.ctx = ctx;
    this.origin = origin;
    try {
      installConnection(ctx, {
        interactions: "answer",
        transport: {
          streamBaseUrl: `${origin}/`,
          fetch: (input: string | URL, init: RequestInit = {}) => {
            const headers = new Headers(init.headers);
            headers.set("cookie", cookie);
            const signal = init.signal
              ? AbortSignal.any([init.signal, controller.signal])
              : controller.signal;
            return fetch(new URL(String(input), origin).toString(), {
              ...init,
              headers,
              signal,
            });
          },
          createWebSocket: (target: string) => new AuthenticatedSocket(target, cookie),
        },
      });
      await ctx.plugin(TypertRegistry);
      ctx.typert.contexts.registerClient("agent", {
        identity: (candidate: any) => candidate?.[agentTag],
        resolve: (id: unknown) => {
          if (typeof id !== "string" || epoch !== this.epoch || this.ctx !== ctx) return undefined;
          this.scope(id);
          return this.scopes.get(id)?.ctx;
        },
      });
      await ctx.plugin(Gateway);
      await ctx.remote.$mount(sessionRemote);
      await ctx.remote.$mount(agentPresetsRemote);
      await ctx.remote.$mount(botPresetsRemote);
      // Product paths B–D: directory picker, settings, uploads, plugins.
      await ctx.remote.$mount(workspaceRemote);
      await ctx.remote.$mount(settingsRemote);
      await ctx.remote.$mount(fileUploadsRemote);
      await ctx.remote.$mount(pluginManagerRemote);
      // Inspector usage / compact and Bot Settings › Skills, Plugins.
      await ctx.remote.$mount(pluginInventoryRemote);
      await ctx.remote.$mount(commandsRemote);
      const owner = this;
      ctx.remote.$on("approval/request", function (this: any, request: ApprovalRequestEvent) {
        const tagged = request.agent as { [agentTag]?: string } | undefined;
        return owner.answerApproval(tagged?.[agentTag] ?? this?.[agentTag], request);
      });
      if (epoch !== this.epoch || this.ctx !== ctx) throw new Error("连接已被新的宿主状态替代");
      await this.waitForGeneration(ctx, controller.signal);
      if (epoch !== this.epoch || this.ctx !== ctx) throw new Error("连接已被新的宿主状态替代");
      this.ready = true;
      this.onGenerationChange?.(true);
      this.generationSubscription = ctx.connection.generation.subscribe(() => {
        if (epoch !== this.epoch || this.ctx !== ctx) return;
        const next = !!ctx.connection.generation.getSnapshot();
        if (next === this.ready) return;
        this.ready = next;
        this.onGenerationChange?.(next);
      });
    } catch (error) {
      await ctx.fiber.dispose().catch(() => undefined);
      if (this.ctx === ctx) this.ctx = undefined;
      throw error instanceof Error ? error : new Error(readableError(error));
    }
  }

  private waitForGeneration(ctx: any, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let unsubscribe = () => {};
      const finish = (error?: Error) => {
        clearTimeout(timer);
        unsubscribe();
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish(new Error("连接已被新的宿主状态替代"));
      const timer = setTimeout(() => finish(new Error("等待后台事件流超时。")), 15_000);
      const check = () => {
        if (ctx.connection.generation.getSnapshot()) finish();
      };
      unsubscribe = ctx.connection.generation.subscribe(check);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else check();
    });
  }

  private get remote(): any {
    if (!this.ctx) throw new Error("尚未连接后台");
    return this.ctx.remote;
  }

  async listAgentPresets(): Promise<AgentPresetSummary[]> {
    const value = unwrap(await this.remote.agentPresets.list()) as {
      presets?: {
        id: string;
        name?: string;
        description?: string;
        isDefault?: boolean;
        broken?: string;
      }[];
    };
    return (value.presets ?? []).map((item) => ({
      id: String(item.id),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : String(item.id),
      ...(typeof item.description === "string" && item.description
        ? { description: item.description }
        : {}),
      isDefault: item.isDefault === true,
      ...(typeof item.broken === "string" && item.broken ? { broken: item.broken } : {}),
    }));
  }

  async readAgentPreset(agentPreset: string): Promise<AgentPresetDetail> {
    const value = unwrap(await this.remote.agentPresets.read(agentPreset)) as AgentPresetDetail;
    return {
      agentPreset: String(value.agentPreset),
      content: String(value.content ?? ""),
      ...(typeof value.name === "string" ? { name: value.name } : {}),
      ...(typeof value.description === "string" ? { description: value.description } : {}),
    };
  }

  /** Change composition on an idle Session (same sessionId). Locked while a turn runs. */
  async selectAgentPreset(sessionId: string, agentPreset: string): Promise<string> {
    return String(unwrap(await this.remote.agentPresets.select(sessionId, agentPreset)));
  }

  /** Copy a Bot's base composition into its own derived preset. */
  async deriveBotPreset(request: BotPresetDeriveRequest): Promise<BotPresetDeriveResult> {
    return unwrap(await this.remote.myaidBotPresets.derive(request)) as BotPresetDeriveResult;
  }

  /** Read one derived preset's saved plugin and skill selections. */
  async readBotPreset(presetId: string): Promise<BotPresetRecord> {
    return unwrap(await this.remote.myaidBotPresets.read(presetId)) as BotPresetRecord;
  }

  /** Replace a derived preset's saved selections. */
  async updateBotPreset(presetId: string, patch: BotPresetUpdateRequest): Promise<BotPresetRecord> {
    return unwrap(await this.remote.myaidBotPresets.update(presetId, patch)) as BotPresetRecord;
  }

  /** Remove a derived preset and its private skill copies. */
  async removeBotPreset(presetId: string): Promise<BotPresetRemoveResult> {
    return unwrap(await this.remote.myaidBotPresets.discard(presetId)) as BotPresetRemoveResult;
  }

  async modelCatalog(): Promise<FlatModelCatalog> {
    const value = unwrap(await this.remote.session.modelCatalog()) as OfficialModelCatalog;
    return flattenModelCatalog(value);
  }

  async createSession(request?: {
    cwd?: string;
    sessionId?: string;
    agentPreset?: string;
  }): Promise<{ sessionId: string }> {
    const body: SessionCreateRequest = {
      ...(request?.cwd ? { cwd: request.cwd } : {}),
      ...(request?.sessionId
        ? { sessionId: request.sessionId as SessionCreateRequest["sessionId"] }
        : {}),
      ...(request?.agentPreset ? { agentPreset: request.agentPreset } : {}),
    };
    const value = unwrap(await this.remote.session.create(body)) as { sessionId: string };
    return { sessionId: String(value.sessionId) };
  }

  async listSessions(): Promise<
    {
      sessionId: string;
      cwd?: string;
      blank: boolean;
      updatedAt: number;
      /** Host-reported Agent state, also for Sessions this Client does not follow. */
      running?: boolean;
      agentAvailable?: boolean;
    }[]
  > {
    const items: {
      sessionId: string;
      cwd?: string;
      blank?: boolean;
      updatedAt?: number;
      running?: boolean;
      agentAvailable?: boolean;
    }[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const value = unwrap(await this.remote.session.list(cursor ? { cursor } : {})) as {
        items?: typeof items;
        cursor?: string;
      };
      items.push(...(value.items ?? []));
      cursor = typeof value.cursor === "string" ? value.cursor : undefined;
      if (!cursor) break;
    }
    return items.map((item) => ({
      sessionId: String(item.sessionId),
      ...(typeof item.cwd === "string" ? { cwd: item.cwd } : {}),
      blank: item.blank === true,
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
      running: item.running === true,
      ...(typeof item.agentAvailable === "boolean" ? { agentAvailable: item.agentAvailable } : {}),
    }));
  }

  async selectModel(request: {
    sessionId: string;
    provider: string;
    model: string;
    /** Model-owned reasoning level (`Runs with`); omitted, the route's default applies. */
    reasoningEffort?: string;
  }): Promise<void> {
    unwrap(
      await this.remote.session.selectModel({
        sessionId: request.sessionId,
        provider: request.provider,
        model: request.model,
        ...(request.reasoningEffort ? { reasoningEffort: request.reasoningEffort } : {}),
      }),
    );
  }

  /**
   * One Session's context occupancy and token totals, from the projections dsh
   * already folds (`contextPressure`, `tokenUsage`). Absent keys are capabilities
   * this deployment does not compose — the Inspector hides those rows.
   */
  async sessionUsage(sessionId: string): Promise<SessionUsage> {
    this.scope(sessionId);
    const value = unwrap(
      await this.remote.session.projections({
        sessionId: sessionId as SessionProjectionsRequest["sessionId"],
      }),
    ) as SessionProjectionsValue;
    const values = (value as { values?: Record<string, unknown> } | null)?.values ?? {};
    const usage: SessionUsage = {};
    const pressure = record(values["contextPressure"]);
    for (const key of ["contextWindow", "pressureTokens", "projectedTokens"] as const) {
      const number = pressure[key];
      if (typeof number === "number" && Number.isFinite(number)) usage[key] = number;
    }
    const totals = record(values["tokenUsage"]);
    const tokens = {
      uncachedInputTokens: count(totals["uncachedInputTokens"]),
      outputTokens: count(totals["outputTokens"]),
      cacheReadTokens: count(totals["cacheReadTokens"]),
      cacheWriteTokens: count(totals["cacheWriteTokens"]),
    };
    if (Object.values(tokens).some((item) => item > 0)) usage.tokens = tokens;
    return usage;
  }

  /** The user-invocable skills of one Session's composition (`skills.list`). */
  async listSkills(sessionId: string): Promise<SkillSummary[]> {
    this.scope(sessionId);
    const value = unwrap(await this.remote.skills.list({ sessionId })) as {
      skills?: readonly Record<string, unknown>[];
    };
    const skills: SkillSummary[] = [];
    for (const item of value.skills ?? []) {
      const name = typeof item.name === "string" ? item.name : "";
      if (!name) continue;
      skills.push({
        name,
        description: typeof item.description === "string" ? item.description : "",
        modelInvocable: item.modelInvocable === true,
        ...(typeof item.whenToUse === "string" ? { whenToUse: item.whenToUse } : {}),
        ...(typeof item.path === "string" ? { path: item.path } : {}),
      });
    }
    return skills;
  }

  /** Run one slash command (the Inspector's Compact runs `/compact`). */
  async executeCommand(sessionId: string, line: string): Promise<CommandOutcome> {
    this.scope(sessionId);
    const value = unwrap(await this.remote.commands.execute(sessionId, line, [])) as
      | { result?: { kind?: string; text?: string } }
      | undefined;
    if (!value) return { kind: "error", text: `这个版本的后台不认 ${line}。` };
    const result = value.result ?? {};
    return {
      kind: result.kind === "success" ? "success" : "error",
      ...(typeof result.text === "string" ? { text: result.text } : {}),
    };
  }

  /** The Loader's plugin entries plus each Agent preset's composition (`pluginInventory.list`). */
  async pluginInventory(): Promise<{
    entries: InventoryEntry[];
    presets: InventoryPreset[];
    /** The profile can be managed (installed / enabled) through `pluginManager`. */
    managementAvailable: boolean;
  }> {
    const value = unwrap(await this.remote.pluginInventory.list()) as {
      entries?: readonly Record<string, unknown>[];
      agentPresets?: readonly Record<string, unknown>[];
      managementAvailable?: boolean;
    };
    return {
      entries: (value.entries ?? []).flatMap((entry) => {
        const entryId = typeof entry.entryId === "string" ? entry.entryId : "";
        const moduleName = typeof entry.moduleName === "string" ? entry.moduleName : "";
        if (!entryId || !moduleName) return [];
        return [
          {
            entryId,
            moduleName,
            ...(localizedName(entry) ? { name: localizedName(entry) as string } : {}),
            enabled: entry.enabled === true,
            fiberPhase: typeof entry.fiberPhase === "string" ? entry.fiberPhase : null,
          },
        ];
      }),
      presets: (value.agentPresets ?? []).flatMap((preset) => {
        const id = typeof preset.id === "string" ? preset.id : "";
        if (!id) return [];
        return [
          {
            id,
            ...(typeof preset.name === "string" ? { name: preset.name } : {}),
            isDefault: preset.isDefault === true,
            ...(typeof preset.broken === "string" ? { broken: preset.broken } : {}),
            rows: (Array.isArray(preset.rows) ? preset.rows : []).flatMap((row) => {
              const item = record(row);
              const moduleName = typeof item.moduleName === "string" ? item.moduleName : "";
              if (!moduleName) return [];
              const enabled =
                item.enabled === "conditional" ? ("conditional" as const) : item.enabled === true;
              return [
                {
                  entryId: typeof item.entryId === "string" ? item.entryId : null,
                  moduleName,
                  ...(localizedName(item) ? { name: localizedName(item) as string } : {}),
                  enabled,
                  fiberPhase: typeof item.fiberPhase === "string" ? item.fiberPhase : null,
                  ...(typeof item.condition === "string" ? { condition: item.condition } : {}),
                  ...(typeof item.diagnostic === "string" ? { diagnostic: item.diagnostic } : {}),
                },
              ];
            }),
          },
        ];
      }),
      managementAvailable: value.managementAvailable === true,
    };
  }

  async prompt(request: {
    sessionId: string;
    requestId: string;
    text?: string;
    content?: readonly PromptContentPart[];
  }): Promise<void> {
    const content: readonly PromptContentPart[] =
      request.content ??
      ([{ type: "text", text: request.text ?? "" }] satisfies PromptContentPart[]);
    unwrap(
      await this.remote.session.prompt({
        sessionId: request.sessionId,
        requestId: request.requestId,
        mode: "queue",
        content,
      }),
    );
  }

  async cancel(sessionId: string): Promise<void> {
    unwrap(await this.remote.session.cancel({ sessionId }));
  }

  /** Mutate a still-pending queue item (e.g. withdraw with `{ kind: "remove" }`). */
  async updateQueue(request: SessionUpdateQueueRequest): Promise<void> {
    unwrap(await this.remote.session.updateQueue(request));
  }

  /** One backwards page of durable history (`session.events`, before `beforeSeq`). */
  async sessionPage(request: {
    sessionId: string;
    beforeSeq: number;
  }): Promise<{ records: unknown[]; hasMore: boolean }> {
    this.scope(request.sessionId);
    const value = unwrap(
      await this.remote.session.events({
        address: { kind: "session", sessionId: request.sessionId } as SessionPageRequest["address"],
        beforeSeq: request.beforeSeq as SessionPageRequest["beforeSeq"],
      }),
    ) as { records?: readonly unknown[]; hasMore?: boolean };
    return { records: [...(value.records ?? [])], hasMore: value.hasMore === true };
  }

  /** The prompts a live Agent still holds, as `session.state` reports them. */
  async sessionQueue(
    sessionId: string,
  ): Promise<{ id: string; requestId?: string; text: string }[]> {
    this.scope(sessionId);
    const value = unwrap(
      await this.remote.session.state({ sessionId: sessionId as SessionStateRequest["sessionId"] }),
    ) as { queue?: readonly Record<string, unknown>[] | null };
    const queue = value.queue ?? [];
    const items: { id: string; requestId?: string; text: string }[] = [];
    for (const item of queue) {
      const id = typeof item.id === "string" ? item.id : "";
      if (!id) continue;
      items.push({
        id,
        ...(typeof item.rpcId === "string" ? { requestId: item.rpcId } : {}),
        text: queueText(item.content),
      });
    }
    return items;
  }

  /** The Session's own title, so dsh and the Client agree on it. */
  async renameSession(sessionId: string, title: string): Promise<void> {
    unwrap(
      await this.remote.session.rename({
        sessionId: sessionId as SessionRenameRequest["sessionId"],
        title,
      }),
    );
  }

  async withdrawQueuedPrompt(sessionId: string, itemId: string): Promise<void> {
    await this.updateQueue({
      sessionId: sessionId as SessionUpdateQueueRequest["sessionId"],
      itemId: itemId as SessionUpdateQueueRequest["itemId"],
      action: { kind: "remove" },
    });
  }

  /** Native directory picker; returns absolute path or null if cancelled. */
  async pickDirectory(): Promise<string | null> {
    const value = unwrap(await this.remote.directoryPicker.pick());
    return typeof value === "string" ? value : null;
  }

  /** Whether this Host can hand a path to the desktop's file manager. */
  async canRevealPath(): Promise<boolean> {
    return unwrap(await this.remote.session.canOpenWorkspacePath()) === true;
  }

  /** Show a verified Host path in the Finder (`session.openWorkspacePath`). */
  async revealPath(path: string): Promise<void> {
    unwrap(await this.remote.session.openWorkspacePath({ path, action: "reveal" }));
  }

  async describeSettings(): Promise<SettingsDescribeValue> {
    return unwrap(await this.remote.settings.describe()) as SettingsDescribeValue;
  }

  async listPlugins(): Promise<PluginInfo[]> {
    return unwrap(await this.remote.pluginManager.listPlugins()) as PluginInfo[];
  }

  async uploadFile(request: {
    sessionId: string;
    data: string;
    name?: string;
  }): Promise<{ receiptId: string }> {
    this.scope(request.sessionId);
    const value = unwrap(
      await this.remote.fileUploads.upload(request.sessionId, {
        data: request.data,
        ...(request.name ? { name: request.name } : {}),
      }),
    ) as { receiptId: string };
    return { receiptId: String(value.receiptId) };
  }

  /** Read one durable image from the attachment store (`session.attachment`). */
  async readAttachment(request: {
    sessionId: string;
    attachment: ImageAttachmentRef;
  }): Promise<SessionAttachmentValue> {
    this.scope(request.sessionId);
    return unwrap(
      await this.remote.session.attachment({
        sessionId: request.sessionId,
        attachment: request.attachment,
      }),
    ) as SessionAttachmentValue;
  }

  /**
   * Follow one Session; returns a disposer that stops only this stream.
   * Concurrent follows each keep their own stream — a newer follow never
   * drops an older one's frames.
   */
  follow(
    sessionId: string,
    onFrame: (frame: SessionFollowFrame) => void,
    onError?: (error: Error) => void,
  ): () => void {
    if (!this.ctx) throw new Error("尚未连接后台");
    this.scope(sessionId);
    // `activate` requests background Agent activation for this Session (the
    // official Web client always sends it); it is not view focus, so every
    // followed Session may ask for it concurrently.
    const stream = this.remote.session.follow({
      address: { kind: "session", sessionId },
      activate: true,
      assistantStream: true,
    });
    let closed = false;
    void (async () => {
      try {
        for await (const frame of stream as AsyncIterable<SessionFollowFrame>) {
          if (closed) return;
          onFrame(frame);
        }
        if (!closed) {
          onError?.(new Error("后台历史流已结束，正在重新连接。"));
        }
      } catch (error) {
        if (!closed) {
          onError?.(new Error(`后台历史流中断：${readableError(error)}`));
        }
      }
    })();
    return () => {
      closed = true;
      try {
        stream.dispose();
      } catch {
        /* already closed */
      }
    };
  }

  private scope(sessionId: string): void {
    if (this.scopes.has(sessionId) || !this.ctx) return;
    const fiber = this.ctx.plugin(agentScope);
    const identity = { sessionId };
    const agent = (fiber as any).ctx.extend({
      [agentTag]: sessionId,
      [Context.filter](listener: any) {
        return listener[agentTag] === undefined || listener[agentTag] === identity.sessionId;
      },
    });
    this.scopes.set(sessionId, {
      ctx: agent,
      dispose: () => (fiber as any).dispose(),
    });
  }

  private async answerApproval(
    sessionId: string | undefined,
    request: ApprovalRequestEvent,
  ): Promise<ApprovalDecision> {
    if (!sessionId || !this.scopes.has(sessionId)) return "unavailable";
    if (request.signal?.aborted) return "cancelled";
    if (!this.approval) return "unavailable";
    try {
      const displayZh =
        request.displayReason && typeof request.displayReason.zh === "string"
          ? request.displayReason.zh
          : undefined;
      return await this.approval({
        sessionId,
        toolName: String(request.toolName ?? "工具"),
        ...(request.callId ? { callId: String(request.callId) } : {}),
        reason: String(displayZh ?? request.reason ?? "需要你的确认"),
        details: JSON.stringify(
          {
            toolName: request.toolName,
            callId: request.callId,
            reason: request.reason,
            displayReason: request.displayReason,
          },
          null,
          2,
        ),
        signal: request.signal,
      });
    } catch {
      return "rejected";
    }
  }

  async dispose(): Promise<void> {
    this.epoch++;
    this.connecting?.abort();
    this.connecting = undefined;
    this.generationSubscription?.();
    this.generationSubscription = undefined;
    const ctx = this.ctx;
    this.ctx = undefined;
    this.ready = false;
    const scopes = [...this.scopes.values()];
    this.scopes.clear();
    for (const scope of scopes) {
      try {
        await scope.dispose();
      } catch {
        /* already gone */
      }
    }
    if (ctx) await ctx.fiber.dispose().catch(() => undefined);
  }
}
