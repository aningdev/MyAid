/**
 * Dialogue Session runtime shell: signals + Host status around ClaimedSession + TurnProjection.
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
import { changeRegistry, ready, registry } from "../../bots/state";
import { sessionScopeBotId } from "../state";
import {
  ClaimedSessionClient,
  type ApprovalDecision,
  type ApprovalRequest,
  type ModelCatalog,
  type SessionTransport,
} from "./claimed";
import { buildSessionRoster, relabelRow, withOccupancy, type SessionRow } from "./roster";
import { TurnProjection, type TurnView } from "./turn";

export type { ApprovalDecision, ApprovalRequest, ModelCatalog, SessionRow };

export type HostStatus = {
  phase: string;
  generation?: string | null;
  pid?: number | null;
  version: string;
  reason?: string | null;
  blocked: boolean;
  url?: string | null;
};

/** Client reachability of the Host control socket — not a Host wire phase. */
export type HostConnection = "up" | "down";

type DshSession = typeof import("../../../lib/dsh/session");
type HostControlApi = typeof import("../../../lib/host/control");

export const hostStatus = signal<HostStatus | null>(null);
export const hostConnection = signal<HostConnection>("down");
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
let turns = new TurnProjection();
let claimed: ClaimedSessionClient | undefined;
let dsh: DshSession | undefined;
let host: HostControlApi | undefined;

async function loadDsh(): Promise<DshSession> {
  if (!dsh) dsh = await import("../../../lib/dsh/session");
  return dsh;
}

async function loadHost(): Promise<HostControlApi> {
  if (!host) host = await import("../../../lib/host/control");
  return host;
}

export type SessionView = TurnView;

const listeners = new Set<(view: SessionView) => void>();

function emit(view: SessionView = turns.snapshot()) {
  for (const listener of listeners) listener(view);
}

export function subscribeSession(listener: (view: SessionView) => void): () => void {
  listeners.add(listener);
  listener(turns.snapshot());
  return () => {
    listeners.delete(listener);
  };
}

/** Start a local prompt turn so freeze waits for a real follow turn. */
export function beginLocalTurn(assistantId: string): void {
  turns.beginTurn(assistantId);
  emit();
}

export function acknowledgeTurnFreeze(): void {
  turns.acknowledgeFreeze();
  emit();
}

export function cancelLocalTurn(): SessionView {
  const view = turns.cancel();
  emit(view);
  return view;
}

export function applyTurnError(message: string): SessionView {
  const view = turns.applyError(message);
  emit(view);
  return view;
}

function rememberSummary(sessionId: string, messages: { kind: string; text?: string }[]) {
  const first = messages.find((message) => message.kind === "user" && message.text?.trim());
  if (!first?.text) return;
  const text = first.text.trim();
  if (summaries.get(sessionId) === text) return;
  summaries.set(sessionId, text);
  const title = claimOwner(untracked(registry), sessionId)?.claim.title ?? null;
  sessionList.update((rows) => relabelRow(rows, sessionId, title, text));
}

function noteActivity(sessionId: string, running: boolean) {
  claimed?.noteActivity(sessionId, running);
  const previous = untracked(occupyingSessionId);
  const next = claimed?.occupyingSessionId ?? null;
  occupyingSessionId.set(next);
  if (previous === next) return;
  sessionList.update((rows) => withOccupancy(rows, next));
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
      hostConnection.set("down");
      return null;
    }
    const status = await hostAccess.status();
    hostStatus.set(status);
    hostConnection.set("up");
    return status;
  } catch (error) {
    const { readableError } = await loadDsh();
    hostStatus.set(null);
    hostConnection.set("down");
    sessionError.set(readableError(error));
    return null;
  }
}

export async function refreshSessionList(): Promise<SessionRow[]> {
  let listed: { sessionId: string; blank: boolean; updatedAt: number }[] | null = null;
  try {
    const transport = claimed?.getTransport();
    if (transport?.ready) listed = await transport.listSessions();
  } catch {
    listed = null;
  }
  const rows = buildSessionRoster({
    registry: untracked(registry),
    listed,
    scopeBotId: untracked(sessionScopeBotId),
    occupyingSessionId: untracked(occupyingSessionId),
    summaries,
  });
  sessionList.set(rows);
  return rows;
}

function wrapConnection(
  connection: import("../../../lib/dsh/connection").Connection,
): SessionTransport {
  return {
    get ready() {
      return connection.ready;
    },
    createSession: (request) => connection.createSession(request),
    listSessions: () => connection.listSessions(),
    follow: (sessionId, onFrame, onError) => connection.follow(sessionId, onFrame, onError),
    prompt: (request) => connection.prompt(request),
    cancel: (sessionId) => connection.cancel(sessionId),
    modelCatalog: () => connection.modelCatalog(),
    selectModel: (request) => connection.selectModel(request),
    approvals: (handler) => connection.approvals(handler),
    dispose: () => connection.dispose(),
  };
}

async function ensureClient(): Promise<ClaimedSessionClient> {
  if (claimed && !claimed.disposed) return claimed;
  const api = await loadDsh();
  claimed = new ClaimedSessionClient({
    connect: async () => wrapConnection(await api.ensureConnected()),
    claim: async (botId, sessionId) => {
      const saved = await changeRegistry((reg) => claimSession(reg, botId, sessionId));
      return !!saved;
    },
    registry: () => untracked(registry),
    summaries: () => summaries,
    onFrame: (sessionId, frame) => {
      const view = turns.receive(frame);
      rememberSummary(sessionId, view.messages);
      noteActivity(sessionId, view.running);
      emit(view);
    },
    onFollowError: (error) => {
      sessionError.set(error.message);
      sessionReady.set(false);
    },
  });
  return claimed;
}

function installApprovalHandler(client: ClaimedSessionClient) {
  client.installApprovalHandler(async (request) => {
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

/** Connect to dsh. Follow `sessionId` when one is given; never create a stand-in session. */
export async function connectSession(sessionId?: string): Promise<void> {
  if (sessionReady() && sessionId && activeSessionId() === sessionId) return;
  if (sessionReady() && !sessionId) return;
  try {
    sessionError.set(null);
    const client = await ensureClient();
    await client.ensureConnected();
    await refreshHostStatus();
    installApprovalHandler(client);
    if (sessionId) {
      const row = untracked(sessionList).find((item) => item.id === sessionId);
      await client.openClaimed(sessionId, !!row?.missing);
      activeSessionId.set(sessionId);
      const api = await loadDsh();
      api.setActiveSessionId(sessionId);
    } else {
      client.stopFollow();
      activeSessionId.set(null);
      const api = await loadDsh();
      api.setActiveSessionId(undefined);
    }
    try {
      modelCatalog.set(await client.getTransport()!.modelCatalog());
    } catch {
      modelCatalog.set(null);
    }
    sessionReady.set(true);
    await refreshSessionList();
    emit();
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
    await connectSession();
    const client = await ensureClient();
    await refreshHostStatus();
    installApprovalHandler(client);
    const preset = presetForBot(untracked(registry), botId);
    const cwd = resolveWorkspace(bot.workspace);
    if (!cwd) throw new Error("这个 Bot 没有工作区。");
    const id = await client.createClaimed({
      botId,
      bot,
      agentPreset: preset,
      cwd,
    });
    activeSessionId.set(id);
    const api = await loadDsh();
    api.setActiveSessionId(id);
    try {
      modelCatalog.set(await client.getTransport()!.modelCatalog());
    } catch {
      modelCatalog.set(null);
    }
    sessionReady.set(true);
    await refreshSessionList();
    emit();
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
  const client = await ensureClient();
  return client.prompt({
    sessionId,
    text,
    bot: owner.bot,
    archived: owner.claim.archived,
  });
}

export async function cancelSession(): Promise<void> {
  await claimed?.cancel();
}

export function resetLocalProjection(): void {
  turns.reset();
  emit();
}

export async function disposeRuntime(): Promise<void> {
  approvalResolve?.("cancelled");
  approvalResolve = undefined;
  pendingApproval.set(null);
  sessionReady.set(false);
  activeSessionId.set(null);
  occupyingSessionId.set(null);
  sessionList.set([]);
  if (claimed) await claimed.dispose().catch(() => undefined);
  claimed = undefined;
  if (dsh) await dsh.disposeSession().catch(() => undefined);
  dsh = undefined;
  host = undefined;
  turns.reset();
}
