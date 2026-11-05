// Bun-prepared Node-condition bundle (`bun run prepare:sdk` → `sdk.js`).
import {
  Context,
  Gateway,
  TypertRegistry,
  agentPresetsRemote,
  installConnection,
  sessionRemote,
} from "./sdk.js";
/**
 * Official `dsh web` protocol client: cookie bootstrap, Gateway, Session Remote.
 * Boundary adapted from dsh-bot `connection.ts` — no product workbench UI.
 */
import { AuthenticatedSocket } from "./socket";

export type ApprovalDecision = "allowed-once" | "rejected" | "cancelled" | "unavailable";

export type ApprovalRequest = {
  sessionId: string;
  toolName: string;
  callId?: string;
  reason: string;
  details: string;
  signal?: AbortSignal;
};

export type CatalogModel = {
  provider: string;
  providerName: string;
  model: string;
  name: string;
  description?: string;
};

export type ModelCatalog = {
  default: { provider: string; model: string };
  models: CatalogModel[];
  failures: { name: string; message: string }[];
};

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

const agentTag = Symbol("myaid.agent");
function agentScope() {}

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
  private followId = 0;
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
    const login = new URL(loginUrl);
    if (login.protocol !== "http:" || login.hostname !== "127.0.0.1") {
      throw new Error("后台地址必须是本机回环地址");
    }
    const token = login.searchParams.get("token");
    if (!token) throw new Error("启动链接缺少认证令牌");
    const url = new URL("/connect", login);
    url.searchParams.set("token", token);
    url.searchParams.set("interactions", "answer");
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        redirect: "manual",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
      });
    } catch (error) {
      throw new Error(`认证请求失败：${readableError(error).replaceAll(token, "<已隐藏>")}`);
    }
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .filter(Boolean)
      .join("; ");
    if (response.status !== 302 || !cookie) {
      throw new Error(`认证失败：后台返回 ${response.status}，未取得 Cookie`);
    }
    if (epoch !== this.epoch) throw new Error("连接已被新的宿主状态替代");

    const ctx: any = new Context();
    this.ctx = ctx;
    this.origin = login.origin;
    try {
      installConnection(ctx, {
        interactions: "answer",
        transport: {
          streamBaseUrl: `${login.origin}/`,
          fetch: (input: string | URL, init: RequestInit = {}) => {
            const headers = new Headers(init.headers);
            headers.set("cookie", cookie);
            const signal = init.signal
              ? AbortSignal.any([init.signal, controller.signal])
              : controller.signal;
            return fetch(new URL(String(input), login.origin).toString(), {
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
      const owner = this;
      ctx.remote.$on("approval/request", function (this: any, request: any) {
        return owner.answerApproval(request.agent?.[agentTag] ?? this?.[agentTag], request);
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

  async listAgentPresets(): Promise<
    { id: string; name: string; description?: string; isDefault: boolean; broken?: string }[]
  > {
    const value: any = unwrap(await this.remote.agentPresets.list());
    return (value.presets ?? []).map((item: any) => ({
      id: String(item.id),
      name: typeof item.name === "string" && item.name.trim() ? item.name.trim() : String(item.id),
      ...(typeof item.description === "string" && item.description
        ? { description: item.description }
        : {}),
      isDefault: item.isDefault === true,
      ...(typeof item.broken === "string" && item.broken ? { broken: item.broken } : {}),
    }));
  }

  async modelCatalog(): Promise<ModelCatalog> {
    const value: any = unwrap(await this.remote.session.modelCatalog());
    return {
      default: { provider: value.default.provider, model: value.default.model },
      models: (value.groups ?? []).flatMap((group: any) =>
        (group.models ?? []).map((model: any) => ({
          provider: group.id,
          providerName: group.name,
          model: model.id,
          name: model.name,
          ...(model.description ? { description: model.description } : {}),
        })),
      ),
      failures: (value.failures ?? []).map((failure: any) => ({
        name: failure.name,
        message: failure.message,
      })),
    };
  }

  async createSession(request?: {
    cwd?: string;
    sessionId?: string;
    agentPreset?: string;
  }): Promise<{ sessionId: string }> {
    const value: any = unwrap(
      await this.remote.session.create({
        ...(request?.cwd ? { cwd: request.cwd } : {}),
        ...(request?.sessionId ? { sessionId: request.sessionId } : {}),
        ...(request?.agentPreset ? { agentPreset: request.agentPreset } : {}),
      }),
    );
    return { sessionId: String(value.sessionId) };
  }

  async listSessions(): Promise<
    { sessionId: string; cwd?: string; blank: boolean; updatedAt: number }[]
  > {
    const items: any[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const value: any = unwrap(await this.remote.session.list(cursor ? { cursor } : {}));
      items.push(...(value.items ?? []));
      cursor = typeof value.cursor === "string" ? value.cursor : undefined;
      if (!cursor) break;
    }
    return items.map((item) => ({
      sessionId: String(item.sessionId),
      ...(typeof item.cwd === "string" ? { cwd: item.cwd } : {}),
      blank: item.blank === true,
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
    }));
  }

  async selectModel(request: {
    sessionId: string;
    provider: string;
    model: string;
  }): Promise<void> {
    unwrap(
      await this.remote.session.selectModel({
        sessionId: request.sessionId,
        provider: request.provider,
        model: request.model,
      }),
    );
  }

  async prompt(request: { sessionId: string; requestId: string; text: string }): Promise<void> {
    unwrap(
      await this.remote.session.prompt({
        sessionId: request.sessionId,
        requestId: request.requestId,
        mode: "queue",
        content: [{ type: "text", text: request.text }],
      }),
    );
  }

  async cancel(sessionId: string): Promise<void> {
    unwrap(await this.remote.session.cancel({ sessionId }));
  }

  /** Follow one Session; returns disposer that stops the stream. */
  follow(
    sessionId: string,
    onFrame: (frame: unknown) => void,
    onError?: (error: Error) => void,
  ): () => void {
    if (!this.ctx) throw new Error("尚未连接后台");
    this.scope(sessionId);
    const stream = this.remote.session.follow({
      address: { kind: "session", sessionId },
      assistantStream: true,
    });
    const id = ++this.followId;
    let closed = false;
    void (async () => {
      try {
        for await (const frame of stream) {
          if (closed || id !== this.followId) return;
          onFrame(frame);
        }
        if (!closed && id === this.followId) {
          onError?.(new Error("后台历史流已结束，正在重新连接。"));
        }
      } catch (error) {
        if (!closed && id === this.followId) {
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
    request: any,
  ): Promise<ApprovalDecision> {
    if (!sessionId || !this.scopes.has(sessionId)) return "unavailable";
    if (request.signal?.aborted) return "cancelled";
    if (!this.approval) return "unavailable";
    try {
      return await this.approval({
        sessionId,
        toolName: String(request.toolName ?? "工具"),
        ...(request.callId ? { callId: String(request.callId) } : {}),
        reason: String(request.displayReason?.zh ?? request.reason ?? "需要你的确认"),
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
