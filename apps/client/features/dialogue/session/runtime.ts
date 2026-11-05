/**
 * Dialogue Session runtime: Host start → Connection → Session follow/prompt.
 * Host control + official dsh SDK load lazily so AppShell / Today stay free of them.
 */
import { signal } from "nsh";

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
  label: string;
  detail: string;
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

function shortLabel(id: string): string {
  if (id === "myaid-primary") return "Assistant";
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
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
  try {
    const api = await loadDsh();
    const connection = api.getConnection();
    if (!connection?.ready) return sessionList();
    const rows = (await api.listSessions(connection))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((item) => ({
        id: item.sessionId,
        label: shortLabel(item.sessionId),
        detail: item.blank ? "空对话" : item.cwd || "Session",
      }));
    if (rows.length === 0 && api.currentSessionId()) {
      const id = api.currentSessionId()!;
      rows.push({ id, label: shortLabel(id), detail: "Session" });
    }
    sessionList.set(rows);
    return rows;
  } catch {
    return sessionList();
  }
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

/** Start Host dsh if needed, connect, follow `sessionId` or primary. */
export async function connectSession(sessionId?: string): Promise<void> {
  if (sessionReady() && sessionId && activeSessionId() === sessionId) return;
  if (sessionReady() && !sessionId && activeSessionId()) return;
  if (connectLock) {
    await connectLock;
    if (sessionReady() && (!sessionId || activeSessionId() === sessionId)) return;
  }
  const work = (async () => {
    sessionError.set(null);
    const api = await loadDsh();
    const connection = await api.ensureConnected();
    await refreshHostStatus();
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
    let id = sessionId;
    if (id) api.setActiveSessionId(id);
    else id = await api.ensurePrimarySession(connection);
    beginFollow(connection, id);
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

/** Create a new official Session and follow it. */
export async function createSession(): Promise<string> {
  sessionError.set(null);
  const api = await loadDsh();
  const connection = await api.ensureConnected();
  await refreshHostStatus();
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
  const id = await api.createNewSession(connection);
  beginFollow(connection, id);
  try {
    modelCatalog.set(await connection.modelCatalog());
  } catch {
    modelCatalog.set(null);
  }
  sessionReady.set(true);
  await refreshSessionList();
  return id;
}

/** Switch follow target to an existing Session. */
export async function openSession(sessionId: string): Promise<void> {
  if (activeSessionId() === sessionId && sessionReady()) return;
  await connectSession(sessionId);
}

export function answerApproval(decision: ApprovalDecision): void {
  approvalResolve?.(decision);
}

export async function promptSession(text: string): Promise<string> {
  const api = await loadDsh();
  let connection = api.getConnection();
  if (!connection?.ready) {
    await connectSession();
    connection = api.getConnection();
  }
  if (!connection) throw new Error("尚未连接后台");
  const sessionId = api.currentSessionId() ?? (await api.ensurePrimarySession(connection));
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
  sessionList.set([]);
  if (dsh) await dsh.disposeSession().catch(() => undefined);
  dsh = undefined;
  host = undefined;
}
