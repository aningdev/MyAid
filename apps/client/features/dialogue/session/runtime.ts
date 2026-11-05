/**
 * Dialogue Session runtime: Host start → Connection → Session follow/prompt.
 * Host control + official dsh SDK load lazily so AppShell / Today stay free of them.
 */
import { homedir } from "os";
import { join } from "path";

import { signal, untracked } from "nsh";

import {
  claimOwner,
  claimSession,
  presetForBot,
  archiveClaim,
  releaseClaim,
  renameClaim,
} from "../../bots/model";
import { listProductSessions, sessionLabel, workspaceKey } from "../../bots/sessions";
import { changeRegistry, ready, registry } from "../../bots/state";
import { sessionScopeBotId } from "../state";
import { SessionProjector } from "./projector";

export type ApprovalDecision = "allowed-once" | "rejected" | "cancelled" | "unavailable";

export type ApprovalRequest = {
  sessionId: string;
  toolName: string;
  callId?: string;
  reason: string;
  details: string;
  signal?: AbortSignal;
};

export type ModelCatalog = {
  default: { provider: string; model: string };
  models: {
    provider: string;
    providerName: string;
    model: string;
    name: string;
    description?: string;
  }[];
  failures: { name: string; message: string }[];
};

export type HostStatus = {
  phase: string;
  generation?: string | null;
  pid?: number | null;
  version: string;
  reason?: string | null;
  blocked: boolean;
  url?: string | null;
};

export type SessionRow = {
  id: string;
  botId: string;
  botName: string;
  label: string;
  detail: string;
  archived: boolean;
  missing: boolean;
  running: boolean;
};

type DshSession = typeof import("../../../lib/dsh/session");
type HostControlApi = typeof import("../../../lib/host/control");

export const hostStatus = signal<HostStatus | null>(null);
export const sessionReady = signal(false);
export const sessionError = signal<string | null>(null);
export const modelCatalog = signal<ModelCatalog | null>(null);
export const pendingApproval = signal<ApprovalRequest | null>(null);
export const sessionList = signal<SessionRow[]>([]);
export const activeSessionId = signal<string | null>(null);
/** Session that is executing, including after the view follows another session. */
export const occupyingSessionId = signal<string | null>(null);
/** True while createSession is talking to dsh / writing the claim. */
export const creatingSession = signal(false);

const summaries = new Map<string, string>();

function resolveWorkspace(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

async function failSession(error: unknown): Promise<never> {
  const api = await loadDsh();
  const message = api.readableError(error);
  sessionError.set(message);
  throw error instanceof Error ? error : new Error(message);
}

let approvalResolve: ((decision: ApprovalDecision) => void) | undefined;
let followStop: (() => void) | undefined;
let projector = new SessionProjector();
let liveAssistantId: string | null = null;
let dsh: DshSession | undefined;
let host: HostControlApi | undefined;
let connectLock: Promise<void> | undefined;

async function loadDsh(): Promise<DshSession> {
  if (!dsh) dsh = await import("../../../lib/dsh/session");
  return dsh;
}

async function loadHost(): Promise<HostControlApi> {
  if (!host) host = await import("../../../lib/host/control");
  return host;
}

export type SessionView = {
  messages: ReturnType<SessionProjector["snapshot"]>["messages"];
  running: boolean;
  status: string;
  liveMd: string;
  liveId: string | null;
};

const listeners = new Set<(view: SessionView) => void>();

function emit() {
  const snap = projector.snapshot();
  const view: SessionView = {
    messages: snap.messages,
    running: snap.running,
    status: snap.status,
    liveMd: snap.liveMd,
    liveId: snap.running && snap.liveMd ? liveAssistantId : null,
  };
  for (const listener of listeners) listener(view);
}

export function subscribeSession(listener: (view: SessionView) => void): () => void {
  listeners.add(listener);
  const snap = projector.snapshot();
  listener({
    messages: snap.messages,
    running: snap.running,
    status: snap.status,
    liveMd: snap.liveMd,
    liveId: liveAssistantId,
  });
  return () => {
    listeners.delete(listener);
  };
}

function rememberSummary(sessionId: string, messages: { kind: string; text?: string }[]) {
  const first = messages.find((message) => message.kind === "user" && message.text?.trim());
  if (!first?.text) return;
  const text = first.text.trim();
  if (summaries.get(sessionId) === text) return;
  summaries.set(sessionId, text);
  const title = claimOwner(untracked(registry), sessionId)?.claim.title ?? null;
  const label = sessionLabel({ title }, text);
  sessionList.update((rows) => rows.map((row) => (row.id === sessionId ? { ...row, label } : row)));
}

function noteActivity(sessionId: string, running: boolean) {
  const previous = untracked(occupyingSessionId);
  if (running) occupyingSessionId.set(sessionId);
  else if (previous === sessionId) occupyingSessionId.set(null);
  const next = untracked(occupyingSessionId);
  if (previous === next) return;
  sessionList.update((rows) =>
    rows.map((row) => ({
      ...row,
      running: row.id === next,
      detail: sessionDetail(row, row.id === next),
    })),
  );
}

const APPROVAL_HELD = "这条审批还没有答复。";

/** Block navigation that would leave the session waiting on approval. Returns true when blocked. */
export function approvalLock(target: {
  sessionId?: string | null;
  botId?: string | null;
  allSessions?: boolean;
}): boolean {
  const pending = untracked(pendingApproval);
  if (!pending) return false;
  const owner = claimOwner(untracked(registry), pending.sessionId);
  const sameSession = target.sessionId === undefined || target.sessionId === pending.sessionId;
  const sameBot = target.botId === undefined || target.botId === owner?.bot.id;
  if (target.allSessions || !sameSession || !sameBot) {
    sessionError.set(APPROVAL_HELD);
    return true;
  }
  return false;
}

export function approvalOwnerBotId(): string | null {
  const pending = untracked(pendingApproval);
  if (!pending) return null;
  return claimOwner(untracked(registry), pending.sessionId)?.bot.id ?? null;
}

export async function refreshHostStatus(): Promise<HostStatus | null> {
  try {
    const { hostAccess } = await loadHost();
    if (!(await hostAccess.reachable())) {
      hostStatus.set(null);
      return null;
    }
    const status = await hostAccess.status();
    hostStatus.set(status);
    return status;
  } catch (error) {
    const { readableError } = await loadDsh();
    hostStatus.set({
      phase: "unavailable",
      blocked: true,
      version: "",
      reason: readableError(error),
    });
    return null;
  }
}

export async function refreshSessionList(): Promise<SessionRow[]> {
  let listed: { sessionId: string; blank: boolean; updatedAt: number }[] | null = null;
  try {
    const api = await loadDsh();
    const connection = api.getConnection();
    if (connection?.ready) listed = await api.listSessions(connection);
  } catch {
    listed = null;
  }
  const occupying = untracked(occupyingSessionId);
  const rows = listProductSessions(untracked(registry), listed, untracked(sessionScopeBotId)).map(
    (item) => ({
      id: item.sessionId,
      botId: item.botId,
      botName: item.botName,
      label: sessionLabel(item, summaries.get(item.sessionId) ?? null),
      detail: sessionDetail(item, occupying === item.sessionId),
      archived: item.archived,
      missing: item.missing,
      running: occupying === item.sessionId,
    }),
  );
  sessionList.set(rows);
  return rows;
}

function sessionDetail(
  item: { botName: string; archived: boolean; missing: boolean },
  running: boolean,
): string {
  const bits = [item.botName];
  if (running) bits.push("执行中");
  if (item.archived) bits.push("已归档");
  if (item.missing) bits.push("待核对");
  return bits.join(" · ");
}

function beginFollow(
  connection: {
    follow: (
      sessionId: string,
      onFrame: (frame: unknown) => void,
      onError?: (error: Error) => void,
    ) => () => void;
  },
  sessionId: string,
) {
  followStop?.();
  projector = new SessionProjector();
  liveAssistantId = null;
  activeSessionId.set(sessionId);
  followStop = connection.follow(
    sessionId,
    (frame) => {
      const view = projector.receive(frame);
      rememberSummary(sessionId, view.messages);
      noteActivity(sessionId, view.running);
      if (view.running && view.liveMd && !liveAssistantId) {
        liveAssistantId = `live-${Date.now()}`;
      }
      if (!view.running) liveAssistantId = null;
      emit();
    },
    (error) => {
      sessionError.set(error.message);
      sessionReady.set(false);
    },
  );
  emit();
}

function installApprovalHandler(api: {
  setApprovalHandler(handler: (request: ApprovalRequest) => Promise<ApprovalDecision>): void;
}) {
  api.setApprovalHandler(async (request) => {
    pendingApproval.set(request);
    return await new Promise<ApprovalDecision>((resolve) => {
      approvalResolve = (decision) => {
        approvalResolve = undefined;
        pendingApproval.set(null);
        resolve(decision);
      };
    });
  });
}

function occupancyBlock(sessionId: string): string | null {
  const occupant = untracked(occupyingSessionId);
  if (!occupant || occupant === sessionId) return null;
  const reg = untracked(registry);
  const left = claimOwner(reg, occupant);
  const right = claimOwner(reg, sessionId);
  if (!left || !right) return null;
  if (workspaceKey(left.bot.workspace) !== workspaceKey(right.bot.workspace)) return null;
  return `工作区正被「${sessionLabel(left.claim, summaries.get(occupant) ?? null)}」占用。`;
}

async function applyBotModel(
  connection: {
    modelCatalog(): Promise<ModelCatalog>;
    selectModel(request: { sessionId: string; provider: string; model: string }): Promise<void>;
  },
  bot: { defaultModel: string | null },
  sessionId: string,
) {
  const want = bot.defaultModel?.trim();
  if (!want) return;
  let catalog = untracked(modelCatalog);
  if (!catalog) {
    try {
      catalog = await connection.modelCatalog();
      modelCatalog.set(catalog);
    } catch {
      return;
    }
  }
  const slash = want.indexOf("/");
  let provider: string | undefined;
  let model: string | undefined;
  if (slash > 0) {
    provider = want.slice(0, slash);
    model = want.slice(slash + 1);
  } else {
    const hits = catalog.models.filter((item) => item.model === want || item.name === want);
    const hit = hits.length === 1 ? hits[0] : undefined;
    if (hit) {
      provider = hit.provider;
      model = hit.model;
    }
  }
  if (!provider || !model) return;
  await connection.selectModel({ sessionId, provider, model });
}

/** Connect to dsh. Follow `sessionId` when one is given; never create a stand-in session. */
export async function connectSession(sessionId?: string): Promise<void> {
  if (sessionReady() && sessionId && activeSessionId() === sessionId) return;
  if (sessionReady() && !sessionId) return;
  if (connectLock) {
    await connectLock;
    if (sessionReady() && (!sessionId || activeSessionId() === sessionId)) return;
  }
  const work = (async () => {
    sessionError.set(null);
    const api = await loadDsh();
    const connection = await api.ensureConnected();
    await refreshHostStatus();
    installApprovalHandler(api);
    if (sessionId) {
      const row = untracked(sessionList).find((item) => item.id === sessionId);
      if (row?.missing) throw new Error("这条会话待核对，dsh 里已经没有它。");
      api.setActiveSessionId(sessionId);
      beginFollow(connection, sessionId);
    } else {
      api.setActiveSessionId(undefined);
    }
    try {
      modelCatalog.set(await connection.modelCatalog());
    } catch {
      modelCatalog.set(null);
    }
    sessionReady.set(true);
    await refreshSessionList();
  })();
  connectLock = work.finally(() => {
    connectLock = undefined;
  });
  try {
    await work;
  } catch (error) {
    sessionReady.set(false);
    const api = await loadDsh();
    const message = api.readableError(error);
    sessionError.set(message);
    throw error instanceof Error ? error : new Error(message);
  }
}

/** Create a session for a ready Bot, claim it, and follow it. */
export async function createSession(botId: string): Promise<string> {
  if (untracked(creatingSession)) throw new Error("正在新建任务。");
  if (approvalLock({ sessionId: "\0" })) {
    throw new Error(untracked(sessionError) ?? APPROVAL_HELD);
  }
  sessionError.set(null);
  creatingSession.set(true);
  try {
    if (!untracked(ready)) throw new Error("注册表还没准备好。");
    const bot = untracked(registry).bots.find((item) => item.id === botId);
    if (!bot || bot.status !== "ready") throw new Error("初始化之后才能新建会话。");
    // Share the Dialogue connect lock so we do not dispose an in-flight connect.
    await connectSession();
    const api = await loadDsh();
    const connection = api.getConnection();
    if (!connection?.ready) throw new Error("尚未连接后台");
    await refreshHostStatus();
    installApprovalHandler(api);
    const preset = presetForBot(untracked(registry), botId);
    const cwd = resolveWorkspace(bot.workspace);
    if (!cwd) throw new Error("这个 Bot 没有工作区。");
    const id = await api.createBoundSession(connection, {
      cwd,
      agentPreset: preset,
    });
    const saved = await changeRegistry((reg) => claimSession(reg, botId, id));
    if (!saved) throw new Error("会话已在后台创建，但没有写入这个 Bot。");
    beginFollow(connection, id);
    try {
      modelCatalog.set(await connection.modelCatalog());
    } catch {
      modelCatalog.set(null);
    }
    sessionReady.set(true);
    await refreshSessionList();
    return id;
  } catch (error) {
    return await failSession(error);
  } finally {
    creatingSession.set(false);
  }
}

/** Switch follow target to an existing claimed Session. */
export async function openSession(sessionId: string): Promise<void> {
  if (approvalLock({ sessionId })) return;
  if (activeSessionId() === sessionId && sessionReady()) return;
  await connectSession(sessionId);
}

export async function archiveSession(sessionId: string): Promise<void> {
  if (untracked(occupyingSessionId) === sessionId) {
    sessionError.set("正在执行，先停止或等这轮结束。");
    return;
  }
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner || owner.claim.archived) return;
  const saved = await changeRegistry((reg) => archiveClaim(reg, owner.bot.id, sessionId));
  if (saved) await refreshSessionList();
}

export async function releaseMissingSession(sessionId: string): Promise<void> {
  const row = untracked(sessionList).find((item) => item.id === sessionId);
  if (!row?.missing) {
    sessionError.set("dsh 里还在的会话不能解除认领。");
    return;
  }
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner) return;
  const saved = await changeRegistry((reg) => releaseClaim(reg, owner.bot.id, sessionId));
  if (saved) await refreshSessionList();
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner) return;
  const saved = await changeRegistry((reg) => renameClaim(reg, owner.bot.id, sessionId, title));
  if (saved) await refreshSessionList();
}

export function answerApproval(decision: ApprovalDecision): void {
  approvalResolve?.(decision);
}

export async function promptSession(text: string, sessionId: string): Promise<string> {
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner) throw new Error("这条会话还没有归到 Bot。");
  if (owner.claim.archived) throw new Error("这条会话已归档。");
  const occupied = occupancyBlock(sessionId);
  if (occupied) throw new Error(occupied);
  const api = await loadDsh();
  let connection = api.getConnection();
  if (!connection?.ready) {
    await connectSession(sessionId);
    connection = api.getConnection();
  }
  if (!connection) throw new Error("尚未连接后台");
  await applyBotModel(connection, owner.bot, sessionId);
  const requestId = crypto.randomUUID().replace(/-/g, "");
  liveAssistantId = `live-${requestId}`;
  await connection.prompt({ sessionId, requestId, text });
  return requestId;
}

export async function cancelSession(): Promise<void> {
  const api = await loadDsh();
  const connection = api.getConnection();
  if (!connection?.ready) return;
  const sessionId = api.currentSessionId();
  if (!sessionId) return;
  await connection.cancel(sessionId);
}

export function resetLocalProjection(): void {
  projector = new SessionProjector();
  liveAssistantId = null;
  emit();
}

export async function disposeRuntime(): Promise<void> {
  followStop?.();
  followStop = undefined;
  approvalResolve?.("cancelled");
  approvalResolve = undefined;
  pendingApproval.set(null);
  sessionReady.set(false);
  activeSessionId.set(null);
  occupyingSessionId.set(null);
  sessionList.set([]);
  if (dsh) await dsh.disposeSession().catch(() => undefined);
  dsh = undefined;
  host = undefined;
}
