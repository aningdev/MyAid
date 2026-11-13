/**
 * Official `dsh web` protocol client: cookie bootstrap, Gateway, and the
 * official React-free Client models (Sessions, Workspaces). No product
 * workbench UI.
 *
 * What lives here is the *transport edge*: one Cordis Context per Client
 * generation, the Remote namespaces MyAid calls, and the official
 * `ctx.sessions` / `ctx.workspaces` models that own session list, history
 * window, follow, paging and reconnect. The product projects their snapshots;
 * it never re-implements them.
 */
import type {
  BotPresetDeriveRequest,
  BotPresetDeriveResult,
  BotPresetRecord,
  BotPresetRemoveResult,
  BotPresetUpdateRequest,
} from "@myaid/dsh-web-protocol/bot-presets";
import type { ISessions, IWorkspaces } from "@myaid/dsh-web-protocol/client";
import type { ApprovalOutcome, ApprovalRequestEvent } from "@myaid/dsh-web-protocol/interaction";
import type { PluginInfo } from "@myaid/dsh-web-protocol/plugins";
import type {
  ImageAttachmentRef,
  ModelCatalog as OfficialModelCatalog,
  SessionAttachmentValue,
  SessionCreateRequest,
  SessionProjectionsValue,
  SessionProjectionsRequest,
  SessionRenameRequest,
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
import { dshRequestInit, fetchSessionCookie } from "./auth";
// Bun-prepared Node-condition bundle (`bun run prepare:sdk` → `sdk.js`).
import {
  Context,
  Gateway,
  TypertRegistry,
  agentPresetsRemote,
  botPresetsRemote,
  commandsRemote,
  fileUploadClient,
  fileUploadsRemote,
  installConnection,
  officialSessionClient,
  officialWorkspaceClient,
  pluginInventoryRemote,
  pluginManagerRemote,
  sessionRemote,
  settingsRemote,
  subagentsRemote,
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

/** What the product asks `session.create` for. */
export type SessionCreateInput = {
  /** The Workspace the Session joins; the Host attaches it after create. */
  workspaceId?: string;
  /** Only when no Workspace is named: `session.create` takes one or the other. */
  cwd?: string;
  sessionId?: string;
  agentPreset?: string;
};

/**
 * The `session.create` body. The Host rejects `workspaceId` with `cwd`, so the
 * Workspace wins when both are known: its path is the canonical one and the
 * attach needs it.
 */
export function sessionCreateBody(request: SessionCreateInput = {}): SessionCreateRequest {
  const cwd = request.workspaceId ? undefined : request.cwd;
  return {
    ...(request.workspaceId
      ? { workspaceId: request.workspaceId as SessionCreateRequest["workspaceId"] }
      : {}),
    ...(cwd ? { cwd } : {}),
    ...(request.sessionId
      ? { sessionId: request.sessionId as SessionCreateRequest["sessionId"] }
      : {}),
    ...(request.agentPreset ? { agentPreset: request.agentPreset } : {}),
  };
}

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

/**
 * Install one official Client model and wait for it to activate. A model whose
 * injected services are missing stays parked in Cordis, so name it instead of
 * hanging the connection.
 */
async function activate(ctx: any, plugin: unknown, label: string): Promise<void> {
  const fiber = ctx.plugin(plugin);
  const missing = await Promise.race([
    fiber.then(() => undefined),
    new Promise<string>((resolve) => setTimeout(() => resolve("超时"), 10_000)),
  ]);
  if (missing === undefined) return;
  const required = (plugin as { inject?: readonly string[] }).inject ?? [];
  const absent = required.filter((name) => ctx.get(name) === undefined);
  throw new Error(
    `官方 Client model 未能装载（${label}）：${missing}${
      absent.length ? `，缺少服务 ${absent.join("、")}` : ""
    }`,
  );
}

type Installed = {
  remote: any;
  connection: any;
  sessions: ISessions;
  workspaces: IWorkspaces;
  fiber: { dispose(): Promise<void> };
};

/**
 * One Client generation: the Connection, the mounted Remote namespaces, and
 * the official Client models installed on the same Context.
 */
/** How long a Connection's fiber may take to dispose before it is left to itself. */
const DISPOSE_TIMEOUT_MS = 3_000;

/** Settle with `work`, or after `ms` without it: a teardown that hangs is not a teardown. */
function within(work: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    void work.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export class Connection {
  private epoch = 0;
  private connecting?: AbortController;
  private generationSubscription?: () => void;
  private ctx?: Installed;
  private approval?: (request: ApprovalRequest) => Promise<ApprovalDecision>;
  private approvalFallback?: () => string | undefined;
  ready = false;
  origin = "";

  onGenerationChange?: (ready: boolean) => void;

  /**
   * Install the approval handler. Without one, approvals fail closed
   * (`unavailable`). `fallback` names the Session when the request itself
   * cannot be traced to one (see `answerApproval`).
   */
  approvals(
    handler: (request: ApprovalRequest) => Promise<ApprovalDecision>,
    fallback?: () => string | undefined,
  ): void {
    this.approval = handler;
    this.approvalFallback = fallback;
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
    this.origin = origin;
    try {
      installConnection(ctx, {
        interactions: "answer",
        transport: {
          streamBaseUrl: `${origin}/`,
          fetch: (input: string | URL, init: RequestInit = {}) => {
            // `dshRequestInit` supplies our cookie and switches the platform's
            // shared jar off (see its note: unmanaged cookies answer 431).
            const signal = init.signal
              ? AbortSignal.any([init.signal, controller.signal])
              : controller.signal;
            return fetch(
              new URL(String(input), origin).toString(),
              dshRequestInit(cookie, { ...init, signal }),
            );
          },
          createWebSocket: (target: string) => new AuthenticatedSocket(target, cookie),
        },
      });
      await ctx.plugin(TypertRegistry);
      await ctx.plugin(Gateway);
      // Every Remote namespace the product or an official model names.
      await ctx.remote.$mount(sessionRemote);
      await ctx.remote.$mount(agentPresetsRemote);
      await ctx.remote.$mount(botPresetsRemote);
      await ctx.remote.$mount(workspaceRemote);
      await ctx.remote.$mount(settingsRemote);
      await ctx.remote.$mount(fileUploadsRemote);
      await ctx.remote.$mount(pluginManagerRemote);
      await ctx.remote.$mount(pluginInventoryRemote);
      await ctx.remote.$mount(commandsRemote);
      await ctx.remote.$mount(subagentsRemote);
      // Official Client models: session list/window/follow/paging, Workspace
      // projection. They own the Agent typert scope, so nothing here registers it.
      await activate(ctx, fileUploadClient, "dsh-client-file-upload[client]");
      await activate(ctx, officialSessionClient, "dsh-api-session-controller[client]");
      await activate(ctx, officialWorkspaceClient, "dsh-api-workspace-controller[client]");
      const owner = this;
      ctx.remote.$on("approval/request", function (this: any, request: ApprovalRequestEvent) {
        if (epoch !== owner.epoch || owner.ctx === undefined) return "unavailable";
        return owner.answerApproval(ctx, request);
      });
      this.ctx = ctx;
      if (epoch !== this.epoch) throw new Error("连接已被新的宿主状态替代");
      await this.waitForGeneration(ctx, controller.signal);
      if (epoch !== this.epoch) throw new Error("连接已被新的宿主状态替代");
      this.ready = true;
      this.onGenerationChange?.(true);
      this.generationSubscription = ctx.connection.generation.subscribe(() => {
        if (epoch !== this.epoch) return;
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

  private get installed(): Installed {
    if (!this.ctx) throw new Error("尚未连接后台");
    return this.ctx;
  }

  private get remote(): any {
    return this.installed.remote;
  }

  /** The official Session model: list, retain, create, projections. */
  get sessions(): ISessions {
    return this.installed.sessions;
  }

  /** The official Workspace model: rows, order, archive set, pins. */
  get workspaces(): IWorkspaces {
    return this.installed.workspaces;
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

  /** Create a Session in a Workspace (the official model catalogues it). */
  async createSession(request?: SessionCreateInput): Promise<{ sessionId: string }> {
    const sessionId = await this.sessions.create(
      sessionCreateBody(request) as Parameters<ISessions["create"]>[0],
    );
    return { sessionId: String(sessionId) };
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

  /** The Session's own title, so dsh and the Client agree on it. */
  async renameSession(sessionId: string, title: string): Promise<void> {
    unwrap(
      await this.remote.session.rename({
        sessionId: sessionId as SessionRenameRequest["sessionId"],
        title,
      }),
    );
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
    return unwrap(
      await this.remote.session.attachment({
        sessionId: request.sessionId,
        attachment: request.attachment,
      }),
    ) as SessionAttachmentValue;
  }

  private async answerApproval(ctx: any, request: ApprovalRequestEvent): Promise<ApprovalDecision> {
    // The request arrives on the Agent-scoped Context the official model
    // resolved. Its tag is the direct read; `sessionOf` also confirms the
    // scope is still live, which a Host generation replacement can take away
    // between the ask and this answer. A Host that asks on a Context this
    // Client no longer tags leaves the product to name its own Session.
    const sessionId =
      (() => {
        try {
          return (ctx.sessions?.scopeOf?.(request.agent) ??
            ctx.sessions?.sessionOf?.(request.agent)?.sessionId) as string | undefined;
        } catch {
          return undefined;
        }
      })() ?? this.approvalFallback?.();
    if (!sessionId) return "unavailable";
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
    // A Connection whose Host is gone has streams and sockets that retry without ever closing;
    // their fiber must not hold the next Connection hostage. The disposal is bounded, and one
    // that outlives it is left to its own retries.
    if (ctx)
      await within(
        ctx.fiber.dispose().catch(() => undefined),
        DISPOSE_TIMEOUT_MS,
      );
  }
}
