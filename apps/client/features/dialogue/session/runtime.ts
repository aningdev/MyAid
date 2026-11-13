/**
 * Dialogue Session runtime: the shared Host connection, the SessionRoster and
 * the per-Session controllers. A Panel reads its own SessionController; a
 * reply keeps streaming when that Panel is gone (controllers for running
 * Sessions stay alive, and mark the Session unread when the reply lands).
 * Host control + official dsh SDK load lazily so AppShell / Today stay free.
 */
import { homedir } from "os";
import { join } from "path";

import { computed, signal, untracked } from "nsh";

import {
  archiveDialogue,
  claimOwner,
  claimSession,
  presetForBot,
  releaseClaim,
  renameClaim,
} from "../../bots/model";
import { titleFromPrompt, type ListedSession } from "../../bots/sessions";
import { changeRegistry, ready, registry } from "../../bots/state";
import {
  ClaimedSessionClient,
  type ApprovalDecision,
  type ApprovalRequest,
  type FlatModelCatalog,
  type ModelCatalog,
  type SessionTransport,
} from "./claimed";
import { SessionRegistry, type SessionController } from "./controller";
import {
  buildSessionRoster,
  relabelRow,
  withStatuses,
  type SessionRow,
  type SessionStatus,
} from "./roster";
import type { TurnView } from "./turn";

export type { ApprovalDecision, ApprovalRequest, FlatModelCatalog, ModelCatalog, SessionRow };
export type { SessionController, SessionStatus };

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
/** The shared Connection is up and serving this Client. */
export const sessionReady = signal(false);
/** Connection-level error; per-Session errors live on the controller. */
export const sessionError = signal<string | null>(null);
export const modelCatalog = signal<FlatModelCatalog | null>(null);
/** Catalog selection when Session is connected: `provider/model`. */
export const catalogModelKey = signal<string | null>(null);
/** True while createSession is talking to dsh / writing the claim. */
export const creatingSession = signal(false);

const summaries = new Map<string, string>();
const rosterBase = signal<SessionRow[]>([]);
/** Controller membership / unread / running / approval changed. */
const changeTick = signal(0);
let listedSessions: ListedSession[] | null = null;

const sessionControllers = new SessionRegistry({
  ensureTransport: () => connectTransport(),
  transport: () => claimed?.getTransport(),
  registry: () => untracked(registry),
  summaries: () => summaries,
  onChange: () => {
    changeTick.update((value) => value + 1);
    // A controller can exist before the first dsh listing (a Panel mounted
    // first): keep the Navigator's rows from going stale-empty.
    if (untracked(rosterBase).length === 0) rebuildRoster();
  },
  onView: (sessionId, view) => {
    // A frame arriving proves the Connection serves this Client: a lost-
    // generation notice from a restart is stale by then.
    if (sessionError() !== null) sessionError.set(null);
    rememberSummary(sessionId, view.messages);
  },
});

const sessionStatuses = computed<ReadonlyMap<string, SessionStatus>>(() => {
  changeTick();
  return sessionControllers.statuses();
});

/** Roster rows, decorated with the live per-Session status. */
export const sessionList = computed<SessionRow[]>(() =>
  withStatuses(rosterBase(), sessionStatuses()),
);

let claimed: ClaimedSessionClient | undefined;
let connectWork: Promise<void> | undefined;
let dsh: DshSession | undefined;
let host: HostControlApi | undefined;

function resolveWorkspace(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

async function loadDsh(): Promise<DshSession> {
  if (!dsh) dsh = await import("../../../lib/dsh/session");
  return dsh;
}

async function loadHost(): Promise<HostControlApi> {
  if (!host) host = await import("../../../lib/host/control");
  return host;
}

async function failSession(error: unknown): Promise<never> {
  const api = await loadDsh();
  const message = api.readableError(error);
  sessionError.set(message);
  throw error instanceof Error ? error : new Error(message);
}

/** The controller for one Session: created on first ask, reused by every Panel showing it. */
export function controllerFor(sessionId: string): SessionController {
  return sessionControllers.controllerFor(sessionId);
}

/** Approvals waiting anywhere, for product surfaces outside a Session Panel. */
export function hasPendingApproval(): boolean {
  return [...sessionStatuses().values()].some((status) => status.attention);
}

export function pendingApprovalFor(sessionId: string | null): ApprovalRequest | null {
  return sessionId ? (sessionControllers.peek(sessionId)?.pendingApproval() ?? null) : null;
}

export function answerApprovalForSession(sessionId: string, decision: ApprovalDecision): void {
  sessionControllers.peek(sessionId)?.answerApproval(decision);
}

function rememberSummary(
  sessionId: string,
  messages: readonly { kind: string; text?: string; at?: number }[],
): void {
  const first = messages.find((message) => message.kind === "user" && message.text?.trim());
  if (!first?.text) return;
  const text = first.text.trim();
  if (summaries.get(sessionId) === text) return;
  summaries.set(sessionId, text);
  const title = claimOwner(untracked(registry), sessionId)?.claim.title ?? null;
  rosterBase.update((rows) => relabelRow(rows, sessionId, title, text));
  // An unnamed Session takes its name from the first prompt (claim + dsh title).
  if (!title) void nameFromPrompt(sessionId, text);
}

/** The first prompt becomes an unnamed Session's title, saved in the claim and in dsh. */
async function nameFromPrompt(sessionId: string, text: string): Promise<void> {
  const title = titleFromPrompt(text);
  if (!title) return;
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner || owner.claim.title) return;
  const saved = await changeRegistry((reg) =>
    renameClaim(reg, owner.dialogue.id, sessionId, title),
  );
  if (!saved) return;
  await refreshSessionList().catch(() => undefined);
  void claimed
    ?.getTransport()
    ?.renameSession(sessionId, title)
    .catch(() => undefined);
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

function rebuildRoster(): void {
  rosterBase.set(
    buildSessionRoster({
      registry: untracked(registry),
      listed: listedSessions,
      summaries,
    }),
  );
}

export async function refreshSessionList(): Promise<SessionRow[]> {
  try {
    const transport = claimed?.getTransport();
    if (transport?.ready) listedSessions = await transport.listSessions();
    else listedSessions = null;
  } catch {
    listedSessions = null;
  }
  rebuildRoster();
  return untracked(sessionList);
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
    sessionPage: (request) => connection.sessionPage(request),
    sessionQueue: (sessionId) => connection.sessionQueue(sessionId),
    prompt: (request) => connection.prompt(request),
    cancel: (sessionId) => connection.cancel(sessionId),
    renameSession: (sessionId, title) => connection.renameSession(sessionId, title),
    uploadFile: (request) => connection.uploadFile(request),
    withdrawQueuedPrompt: (sessionId, itemId) => connection.withdrawQueuedPrompt(sessionId, itemId),
    selectAgentPreset: (sessionId, agentPreset) =>
      connection.selectAgentPreset(sessionId, agentPreset),
    modelCatalog: () => connection.modelCatalog(),
    selectModel: (request) => connection.selectModel(request),
    sessionUsage: (sessionId) => connection.sessionUsage(sessionId),
    executeCommand: (sessionId, line) => connection.executeCommand(sessionId, line),
    listSkills: (sessionId) => connection.listSkills(sessionId),
    pluginInventory: () => connection.pluginInventory(),
    botPresets: {
      derive: (request) => connection.deriveBotPreset(request),
      read: (presetId) => connection.readBotPreset(presetId),
      update: (presetId, patch) => connection.updateBotPreset(presetId, patch),
      discard: (presetId) => connection.removeBotPreset(presetId),
    },
    canReveal: () => connection.canRevealPath(),
    revealPath: (path) => connection.revealPath(path),
    approvals: (handler) => connection.approvals(handler),
    dispose: () => connection.dispose(),
  };
}

function onGenerationChange(up: boolean): void {
  if (!up) {
    sessionReady.set(false);
    sessionError.set("后台连接已断开。");
    sessionControllers.connectionLost();
    return;
  }
  sessionReady.set(true);
  sessionError.set(null);
  sessionControllers.connectionRestored();
  void refreshSessionList().catch(() => undefined);
}

async function ensureClient(): Promise<ClaimedSessionClient> {
  if (claimed && !claimed.disposed) return claimed;
  const api = await loadDsh();
  claimed = new ClaimedSessionClient({
    connect: async () => {
      const connection = await api.ensureConnected();
      connection.approvals((request) =>
        sessionControllers.controllerFor(request.sessionId).requestApproval(request),
      );
      connection.onGenerationChange = (up) => onGenerationChange(up);
      return wrapConnection(connection);
    },
    claim: async (dialogueId, sessionId) => {
      const saved = await changeRegistry((reg) => claimSession(reg, dialogueId, sessionId));
      return !!saved;
    },
    registry: () => untracked(registry),
  });
  return claimed;
}

/**
 * Connect the one shared Connection (idempotent, concurrent callers share it).
 * The optional id is accepted for legacy callers; following is per controller.
 */
export function connectSession(_sessionId?: string): Promise<void> {
  if (sessionReady() && claimed?.getTransport()?.ready) return Promise.resolve();
  if (connectWork) return connectWork;
  const work = (async () => {
    sessionError.set(null);
    const client = await ensureClient();
    // A dead transport is being replaced: tell controllers before their
    // stale follow streams are dropped, so a shown Session re-follows.
    const previous = client.getTransport();
    if (previous && !previous.ready) sessionControllers.connectionLost();
    const transport = await client.ensureConnected();
    await refreshHostStatus();
    try {
      modelCatalog.set(await transport.modelCatalog());
    } catch {
      modelCatalog.set(null);
    }
    sessionReady.set(true);
    sessionControllers.connectionRestored();
    await refreshSessionList();
  })();
  connectWork = work
    .catch(async (error) => {
      sessionReady.set(false);
      await failSession(error);
    })
    .finally(() => {
      connectWork = undefined;
    });
  return connectWork;
}

async function connectTransport(): Promise<SessionTransport> {
  await connectSession();
  const transport = claimed?.getTransport();
  if (!transport?.ready) throw new Error("尚未连接后台");
  return transport;
}

/** Create a session for an active Dialogue, claim it. The Panel that opens it follows. */
export async function createSession(dialogueId: string): Promise<string> {
  if (untracked(creatingSession)) throw new Error("正在新建上下文。");
  sessionError.set(null);
  creatingSession.set(true);
  try {
    if (!untracked(ready)) throw new Error("注册表还没准备好。");
    const dialogue = untracked(registry).dialogues.find((item) => item.id === dialogueId);
    if (!dialogue) throw new Error("找不到这段 Dialogue。");
    if (dialogue.archived) throw new Error("这段 Dialogue 已归档。");
    const bot = untracked(registry).bots.find((item) => item.id === dialogue.botId);
    if (!bot || bot.status !== "ready") throw new Error("初始化之后才能新建会话。");
    await connectSession();
    const client = await ensureClient();
    const preset = presetForBot(untracked(registry), bot.id);
    const cwd = resolveWorkspace(dialogue.workspacePath);
    if (!cwd) throw new Error("这段 Dialogue 没有工作区路径。");
    const id = await client.createClaimed({
      dialogueId: dialogue.id,
      dialogue: { ...dialogue, workspacePath: cwd },
      bot,
      agentPreset: preset,
    });
    await refreshSessionList();
    return id;
  } catch (error) {
    return await failSession(error);
  } finally {
    creatingSession.set(false);
  }
}

/** Pick the model this Session runs on (`session.selectModel`). */
export async function selectSessionModel(sessionId: string, key: string): Promise<void> {
  const at = key.indexOf("/");
  if (at <= 0) return;
  const provider = key.slice(0, at);
  const model = key.slice(at + 1);
  try {
    const transport = await connectTransport();
    await transport.selectModel({ sessionId, provider, model });
    catalogModelKey.set(key);
  } catch (error) {
    sessionError.set(error instanceof Error ? error.message : String(error));
  }
}

/** Archive the Dialogue that owns this session (product default). */
export async function archiveOwningDialogue(sessionId: string): Promise<void> {
  if (sessionControllers.peek(sessionId)?.running()) {
    sessionError.set("正在执行，先停止或等这轮结束。");
    return;
  }
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner || owner.dialogue.archived) return;
  const saved = await changeRegistry((reg) => archiveDialogue(reg, owner.dialogue.id));
  if (saved) await refreshSessionList();
}

/** @deprecated Prefer {@link archiveOwningDialogue}. */
export async function archiveSession(sessionId: string): Promise<void> {
  await archiveOwningDialogue(sessionId);
}

export async function releaseMissingSession(sessionId: string): Promise<void> {
  const row = untracked(sessionList).find((item) => item.id === sessionId);
  if (!row?.missing) {
    sessionError.set("dsh 里还在的会话不能解除认领。");
    return;
  }
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner) return;
  const saved = await changeRegistry((reg) => releaseClaim(reg, owner.dialogue.id, sessionId));
  if (saved) await refreshSessionList();
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner) return;
  const trimmed = title.trim();
  const saved = await changeRegistry((reg) =>
    renameClaim(reg, owner.dialogue.id, sessionId, trimmed || null),
  );
  if (!saved) return;
  const transport = claimed?.getTransport();
  if (trimmed && transport?.ready) {
    void transport.renameSession(sessionId, trimmed).catch(() => undefined);
  }
  await refreshSessionList();
}

/** The shared transport, for surfaces that read Session facts but own no controller. */
export function sessionTransport(): SessionTransport | undefined {
  return claimed?.getTransport();
}

export async function disposeRuntime(): Promise<void> {
  sessionControllers.disposeAll();
  sessionReady.set(false);
  sessionError.set(null);
  rosterBase.set([]);
  listedSessions = null;
  summaries.clear();
  if (claimed) await claimed.dispose().catch(() => undefined);
  claimed = undefined;
  if (dsh) await dsh.disposeSession().catch(() => undefined);
  dsh = undefined;
  host = undefined;
}
