/**
 * Dialogue Session runtime: the shared Connection, the official Client models
 * it installs, and the per-Session controllers. A Panel reads its own
 * SessionController; a reply keeps streaming when that Panel is gone
 * (controllers for running Sessions stay alive, and mark the Session unread
 * when the reply lands).
 * Host control + official dsh SDK load lazily so AppShell / Today stay free.
 */
import type { ISessions, SessionListState, SessionSummary } from "@myaid/dsh-web-protocol/client";
import { computed, signal, untracked } from "nsh";

import {
  claimOwner,
  claimSession,
  presetForBot,
  releaseClaim,
  renameClaim,
} from "../../bots/model";
import { titleFromPrompt, type ListedSession } from "../../bots/sessions";
import { changeRegistry, ready, registry } from "../../bots/state";
import {
  isSessionArchived,
  startWorkspaces,
  stopWorkspaces,
  whenWorkspacesReady,
  workspaces,
} from "../../workspace/state";
import {
  ClaimedSessionClient,
  type ApprovalDecision,
  type ApprovalRequest,
  type FlatModelCatalog,
  type ModelCatalog,
  type SessionHost,
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
/** The official list's rows; the roster joins them with the claims. */
let listedSessions: ListedSession[] | null = null;

const sessionControllers = new SessionRegistry({
  ensureHost: () => connectHost(),
  host: () => claimed?.getHost(),
  registry: () => untracked(registry),
  sessionArchived: (sessionId) => isSessionArchived(untracked(workspaces), sessionId),
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
/** Set while a lost Host is being watched for its return. */
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
/** Stop the official list subscription when the Connection goes away. */
let stopList: (() => void) | undefined;

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
    ?.getHost()
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

/** The official list rows as the roster reads them. */
function listed(state: SessionListState | null): ListedSession[] | null {
  if (!state || state.phase !== "ready") return null;
  const rows: ListedSession[] = [];
  for (const id of state.ids) {
    const row: SessionSummary | undefined = state.byId[id];
    if (!row) continue;
    rows.push({
      sessionId: row.id,
      blank: row.blank,
      updatedAt: row.updatedAt,
      running: row.running,
    });
  }
  return rows;
}

function rebuildRoster(): void {
  rosterBase.set(
    buildSessionRoster({
      registry: untracked(registry),
      listed: listedSessions,
      workspaces: untracked(workspaces),
      summaries,
    }),
  );
}

/** Re-read the official Session list, then rebuild the Navigator's rows. */
export async function refreshSessionList(): Promise<SessionRow[]> {
  const model = claimed?.getHost()?.sessions;
  if (model) {
    await model.refresh().catch(() => undefined);
    listedSessions = listed(model.list.getSnapshot());
  } else {
    listedSessions = null;
  }
  rebuildRoster();
  return untracked(sessionList);
}

/** Follow the official list: creates, removes and Host status land here. */
function watchSessionList(model: ISessions): void {
  stopList?.();
  const source = model.list;
  const read = () => {
    const next = listed(source.getSnapshot());
    listedSessions = next;
    rebuildRoster();
    changeTick.update((value) => value + 1);
  };
  const unsubscribe = source.subscribe(read);
  stopList = unsubscribe;
  read();
}

function wrapConnection(connection: import("../../../lib/dsh/connection").Connection): SessionHost {
  return {
    get ready() {
      return connection.ready;
    },
    get sessions() {
      return connection.sessions;
    },
    get workspaces() {
      return connection.workspaces;
    },
    createSession: (request) => connection.createSession(request),
    modelCatalog: () => connection.modelCatalog(),
    selectModel: (request) => connection.selectModel(request),
    selectAgentPreset: (sessionId, agentPreset) =>
      connection.selectAgentPreset(sessionId, agentPreset),
    renameSession: (sessionId, title) => connection.renameSession(sessionId, title),
    uploadFile: (request) => connection.uploadFile(request),
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
  sessionReady.set(up);
  if (!up) {
    // The official models keep the last published window while their streams
    // reconnect; the product only names the gap until the next frame.
    sessionError.set("后台连接已断开。");
    watchForHost();
    return;
  }
  sessionError.set(null);
  sessionControllers.reattach();
  void refreshSessionList().catch(() => undefined);
}

/**
 * A Host that went away may come back on a new port, with a new login URL and
 * a new dsh. Nothing in the official Connection can cross that (it owns one
 * Host generation), so the product asks the Host control socket until it
 * answers and then rebuilds the Connection — controllers re-bind to the new
 * model and every Session window is restored from it.
 */
function watchForHost(): void {
  if (reconnectTimer !== undefined) return;
  const since = Date.now();
  let attempt = 0;
  let replaced = false;
  const schedule = (delay: number) => {
    reconnectTimer = setTimeout(() => void tick(), delay);
  };
  const tick = async () => {
    reconnectTimer = undefined;
    if (sessionReady()) return;
    attempt += 1;
    await refreshHostStatus().catch(() => undefined);
    if (hostConnection() !== "up") {
      // Back off while the Host itself is away (a restart takes seconds).
      schedule(Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)));
      return;
    }
    // A Host that answers but never serves a generation again — a mux the
    // Host's dsh terminated, a dsh that died under it — gets one replacement:
    // a new Connection re-runs `/connect` against whatever dsh serves now.
    // Retrying more often than that only churns sockets.
    if (!replaced && Date.now() - since > 8_000) {
      replaced = true;
      await claimed
        ?.getHost()
        ?.dispose()
        .catch(() => undefined);
    }
    await connectSession().catch(() => undefined);
    if (!sessionReady()) schedule(Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5)));
  };
  schedule(2_000);
}

async function ensureClient(): Promise<ClaimedSessionClient> {
  if (claimed && !claimed.disposed) return claimed;
  const api = await loadDsh();
  claimed = new ClaimedSessionClient({
    connect: async () => {
      const connection = await api.ensureConnected();
      connection.approvals(
        (request) => sessionControllers.controllerFor(request.sessionId).requestApproval(request),
        // An approval belongs to the turn that asked; when the Host's request
        // carries no Session this Client can name, the one running turn is it.
        () => {
          const running = sessionControllers.runningSessionIds();
          return running.length === 1 ? running[0] : undefined;
        },
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
 * The official models open their own streams; this only wires the product's
 * Workspace projection, catalog and roster.
 */
export function connectSession(_sessionId?: string): Promise<void> {
  if (sessionReady() && claimed?.getHost()?.ready) return Promise.resolve();
  if (connectWork) return connectWork;
  const work = (async () => {
    sessionError.set(null);
    const client = await ensureClient();
    const previous = client.getHost();
    if (previous && !previous.ready) {
      // The old Connection is going away with its streams and Client
      // generation: every controller has to read the new model.
      await stopWorkspaces();
      stopList?.();
      stopList = undefined;
      sessionControllers.rebind();
    }
    const hostApi = await client.ensureConnected();
    // The Workspace projection holds the tree's paths, titles and order.
    startWorkspaces(hostApi.workspaces.list);
    // Restored Panel addresses need a Workspace title and path.
    await whenWorkspacesReady();
    await refreshHostStatus();
    try {
      modelCatalog.set(await hostApi.modelCatalog());
    } catch {
      modelCatalog.set(null);
    }
    watchSessionList(hostApi.sessions);
    sessionReady.set(true);
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

async function connectHost(): Promise<SessionHost> {
  await connectSession();
  const api = claimed?.getHost();
  if (!api?.ready) throw new Error("尚未连接后台");
  return api;
}

/** Create a session for an active Dialogue, claim it. The Panel that opens it reads it. */
export async function createSession(dialogueId: string): Promise<string> {
  if (untracked(creatingSession)) throw new Error("正在新建上下文。");
  sessionError.set(null);
  creatingSession.set(true);
  try {
    if (!untracked(ready)) throw new Error("注册表还没准备好。");
    const dialogue = untracked(registry).dialogues.find((item) => item.id === dialogueId);
    if (!dialogue) throw new Error("找不到这段 Dialogue。");
    const bot = untracked(registry).bots.find((item) => item.id === dialogue.botId);
    if (!bot || bot.status !== "ready") throw new Error("初始化之后才能新建会话。");
    await connectSession();
    const client = await ensureClient();
    const preset = presetForBot(untracked(registry), bot.id);
    if (!dialogue.workspaceId) throw new Error("这段 Dialogue 还没有 dsh Workspace。");
    const id = await client.createClaimed({
      dialogueId: dialogue.id,
      dialogue,
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
    const hostApi = await connectHost();
    await hostApi.selectModel({ sessionId, provider, model });
    catalogModelKey.set(key);
  } catch (error) {
    sessionError.set(error instanceof Error ? error.message : String(error));
  }
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
  const hostApi = claimed?.getHost();
  if (trimmed && hostApi?.ready) {
    void hostApi.renameSession(sessionId, trimmed).catch(() => undefined);
  }
  await refreshSessionList();
}

/** The shared host, for surfaces that read Session facts but own no controller. */
export function sessionTransport(): SessionHost | undefined {
  return claimed?.getHost();
}

export async function disposeRuntime(): Promise<void> {
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  sessionControllers.disposeAll();
  sessionReady.set(false);
  sessionError.set(null);
  rosterBase.set([]);
  listedSessions = null;
  summaries.clear();
  stopList?.();
  stopList = undefined;
  await stopWorkspaces();
  if (claimed) await claimed.dispose().catch(() => undefined);
  claimed = undefined;
  if (dsh) await dsh.disposeSession().catch(() => undefined);
  dsh = undefined;
  host = undefined;
}
