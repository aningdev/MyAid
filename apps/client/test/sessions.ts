/**
 * Test fixture: a scripted stand-in for the official `ctx.sessions` model, so
 * Panels and controllers can be driven without a Host. It uses the official
 * `MutableSessionEventSource` for the window, so deltas, revisions and
 * settlements behave exactly as the real model publishes them.
 */
import type {
  ISessions,
  SessionEventLikeEntry,
  SessionEventWindow,
  SessionId,
  SessionListState,
  SessionReference,
  SessionSnapshot,
} from "@dsh-bot/dsh-web-protocol/client";

import type { SessionHost } from "../features/dialogue/session/claimed";
import { officialSessionClient } from "../lib/dsh/sdk.js";

type MutableWindow = {
  getSnapshot(): SessionEventWindow;
  replace(entries: readonly SessionEventLikeEntry[], hasMore: boolean): void;
  prepend(entries: readonly SessionEventLikeEntry[], hasMore: boolean): void;
  append(entry: SessionEventLikeEntry): void;
  settleAssistant(attemptId: unknown, entry?: unknown): void;
};

const EventSource = (
  officialSessionClient as unknown as { MutableSessionEventSource: new () => MutableWindow }
).MutableSessionEventSource;

/** One prompt the fake Session accepted. */
export type ScriptedPrompt = {
  sessionId: string;
  text: string;
  requestId: string;
  mode: string;
};

/** One queue edit the fake Session accepted. */
export type ScriptedQueueEdit = { sessionId: string; itemId: string; action: unknown };

/** One frame the scripted Session publishes. */
export type ScriptedUpdate =
  | { kind: "replace"; entries: readonly SessionEventLikeEntry[]; hasMore: boolean }
  | { kind: "prepend"; entries: readonly SessionEventLikeEntry[]; hasMore: boolean }
  | { kind: "append"; entry: SessionEventLikeEntry };

type Listener = () => void;

function listeners(): { subscribe(listener: Listener): () => void; notify(): void } {
  let set: Listener[] = [];
  return {
    subscribe(listener) {
      set = [...set, listener];
      return () => {
        set = set.filter((item) => item !== listener);
      };
    },
    notify() {
      for (const listener of [...set]) listener();
    },
  };
}

/** A durable Session event the script can append. */
export function durable(
  seq: number,
  type: string,
  data: Record<string, unknown> = {},
): SessionEventLikeEntry {
  return {
    type: "event",
    event: { seq, type, time: Date.now(), data },
  } as unknown as SessionEventLikeEntry;
}

/** One client-only Assistant chunk, as the official model orders it. */
export function liveChunk(seq: number, attemptId: string, text: string): SessionEventLikeEntry {
  return {
    type: "transient",
    event: {
      type: "assistant/live-chunk",
      seq,
      time: Date.now(),
      data: {
        attemptId,
        turn: 1,
        step: 1,
        chunk: { type: "text-delta", text },
      },
    },
  } as unknown as SessionEventLikeEntry;
}

/** A prompt's durable user message, carrying the request id dsh echoes. */
export function userMessage(seq: number, text: string, requestId?: string): SessionEventLikeEntry {
  return durable(seq, "user/message", {
    content: text,
    source: { kind: "user", ...(requestId ? { rpcId: requestId } : {}) },
  });
}

/** An assistant message with one text block. */
export function assistantMessage(seq: number, text: string): SessionEventLikeEntry {
  return durable(seq, "assistant/message", { message: { content: [{ type: "text", text }] } });
}

type FakeSession = {
  sessionId: string;
  window: MutableWindow;
  values: Map<string, unknown>;
  snapshot: SessionSnapshot;
  listeners: ReturnType<typeof listeners>;
  channels: Map<string, ReturnType<typeof listeners>>;
};

function snapshotOf(sessionId: string): SessionSnapshot {
  return {
    sessionId: sessionId as SessionId,
    pendingSubmissions: [],
    running: false,
    subagent: null,
    removed: false,
    openState: "open",
    openError: null,
    hasMore: false,
    historyWasPartial: false,
    loadingOlder: false,
    historyLoadStatus: "idle",
    promptError: null,
    blank: false,
    lastAgentError: null,
    promptAttempted: false,
    awaitingFirstTurn: false,
  };
}

/** What a scripted Session model exposes beyond the official face. */
export type ScriptedSessions = ISessions & {
  /** Add (or update) one catalogue row. */
  row(sessionId: string, fields?: { blank?: boolean; updatedAt?: number; running?: boolean }): void;
  /** Publish one window update for a Session, as a follow generation does. */
  update(sessionId: string, change: ScriptedUpdate): void;
  /** The Host-asserted turn state of one Session. */
  running(sessionId: string, running: boolean): void;
  /** The `inbox` projection rows (queued prompts dsh still holds). */
  inbox(sessionId: string, rows: readonly { id: string; rpcId?: string; text: string }[]): void;
  /** Mark one Session's snapshot as still opening (or settled). */
  loadingOlder(sessionId: string, loading: boolean): void;
  /** What `loadOlder` publishes when a Panel asks for older history. */
  older(
    sessionId: string,
    page: { entries: readonly SessionEventLikeEntry[]; hasMore: boolean },
  ): void;
  prompts: ScriptedPrompt[];
  queueEdits: ScriptedQueueEdit[];
  cancels: string[];
  olderLoads: string[];
  /** Prompts are answered by this hook; without one they are only recorded. */
  onPrompt?: (prompt: ScriptedPrompt) => void;
  /** Cancels are answered by this hook; without one they are only recorded. */
  onCancel?: (sessionId: string) => void;
};

/**
 * Build the scripted model. `sessions` lists the catalogue rows the Host would
 * report; every other state is driven by the test.
 */
export function scriptedSessions(ids: readonly string[] = []): ScriptedSessions {
  const sessions = new Map<string, FakeSession>();
  const rows = new Map<string, { blank: boolean; updatedAt: number; running: boolean }>();
  const listListeners = listeners();
  const retained = new Map<string, number>();
  const olderPages = new Map<
    string,
    { entries: readonly SessionEventLikeEntry[]; hasMore: boolean }
  >();

  const listState = (): SessionListState => {
    const state = {
      ids: [...rows.keys()] as SessionId[],
      byId: {} as SessionListState["byId"],
      phase: "ready" as const,
      projectionsBySession: {},
    };
    for (const [id, row] of rows) {
      state.byId[id as SessionId] = {
        id: id as SessionId,
        displayTitle: id,
        running: row.running,
        blank: row.blank,
        updatedAt: row.updatedAt,
        retainedBy: {},
      };
    }
    return state;
  };

  const fake = (sessionId: string): FakeSession => {
    const existing = sessions.get(sessionId);
    if (existing) return existing;
    const entry: FakeSession = {
      sessionId,
      window: new EventSource(),
      values: new Map(),
      snapshot: snapshotOf(sessionId),
      listeners: listeners(),
      channels: new Map(),
    };
    sessions.set(sessionId, entry);
    return entry;
  };

  const publish = (entry: FakeSession): void => {
    entry.listeners.notify();
  };

  const setSnapshot = (entry: FakeSession, patch: Partial<SessionSnapshot>): void => {
    entry.snapshot = { ...entry.snapshot, ...patch };
    publish(entry);
  };

  const channel = (entry: FakeSession, key: string) => {
    const existing = entry.channels.get(key);
    if (existing) return existing;
    const created = listeners();
    entry.channels.set(key, created);
    return created;
  };

  const setProjection = (entry: FakeSession, key: string, value: unknown): void => {
    entry.values.set(key, value);
    channel(entry, key).notify();
  };

  const face = (entry: FakeSession, key: string) => ({
    getSnapshot: () => entry.values.get(key),
    subscribe: (listener: () => void) => channel(entry, key).subscribe(listener),
  });

  const session = (entry: FakeSession) => ({
    sessionId: entry.sessionId as SessionId,
    projections: { faceOf: (key: string) => face(entry, key) },
    beginSubmission: () => ({ requestId: "sub", abandon: () => undefined }),
    prompt: async (
      content: readonly { type?: string; text?: string }[],
      mode: string,
      _signal?: AbortSignal,
      requestId?: string,
    ) => {
      const text = content.map((part) => (part.type === "text" ? (part.text ?? "") : "")).join("");
      const prompt: ScriptedPrompt = {
        sessionId: entry.sessionId,
        text,
        requestId: requestId ?? "",
        mode,
      };
      model.prompts.push(prompt);
      model.onPrompt?.(prompt);
      return { ok: true as const, value: { accepted: true as const } };
    },
    readAttachment: async () => ({ ok: false as const, error: { code: "x", message: "x" } }),
    updateQueue: async (itemId: string, action: unknown) => {
      model.queueEdits.push({ sessionId: entry.sessionId, itemId, action });
      const inbox = entry.values.get("inbox") as
        | { "next-turn"?: readonly { id: string }[]; "next-step"?: readonly { id: string }[] }
        | undefined;
      const keep = (rows: readonly { id: string }[] | undefined) =>
        (rows ?? []).filter((row) => row.id !== itemId);
      setProjection(entry, "inbox", {
        "next-turn": keep(inbox?.["next-turn"]),
        "next-step": keep(inbox?.["next-step"]),
      });
      return { ok: true as const, value: { accepted: true as const } };
    },
    cancel: async () => {
      model.cancels.push(entry.sessionId);
      model.onCancel?.(entry.sessionId);
      return { ok: true as const, value: { accepted: true as const } };
    },
    rename: async (title: string) => ({
      ok: true as const,
      value: { title, seq: 0 },
    }),
    loadOlder: async () => {
      model.olderLoads.push(entry.sessionId);
      const page = olderPages.get(entry.sessionId);
      if (page) entry.window.prepend(page.entries, page.hasMore);
    },
    loadThrough: async () => undefined,
    command: async () => ({ ok: true as const, value: { matched: true } }),
    getSnapshot: () => entry.snapshot,
    subscribe: (listener: () => void) => entry.listeners.subscribe(listener),
  });

  const model = {
    list: {
      getSnapshot: listState,
      subscribe: (listener: () => void) => listListeners.subscribe(listener),
    },
    retain: (target: string, options: { source?: string } = {}) => {
      const entry = fake(target);
      rows.set(target, rows.get(target) ?? { blank: false, updatedAt: 0, running: false });
      retained.set(target, (retained.get(target) ?? 0) + 1);
      const binding = {
        sessionId: target as SessionId,
        session: session(entry),
        eventSource: entry.window,
        ctx: {},
      };
      const reference: SessionReference = {
        sessionId: target as SessionId,
        binding: binding as never,
        ready: Promise.resolve(binding as never),
        release: () => {
          const next = (retained.get(target) ?? 1) - 1;
          if (next <= 0) retained.delete(target);
          else retained.set(target, next);
          void options;
        },
        [Symbol.dispose]: () => {
          /* the reference is released explicitly by its owner */
        },
      };
      listListeners.notify();
      return reference;
    },
    using: async (target: string, options: never, operation: (reference: never) => unknown) => {
      const reference = model.retain(target, options);
      try {
        return await operation(reference as never);
      } finally {
        reference.release();
      }
    },
    retainInfo: (id: string) => ({
      getSnapshot: () => ({
        referenceCount: retained.get(id) ?? 0,
        retainedBy: retained.has(id) ? { panel: retained.get(id) as number } : {},
      }),
      subscribe: () => () => undefined,
    }),
    searchResultLimit: 20,
    create: async (options?: {
      sessionId?: string;
      workspaceId?: string;
      agentPreset?: string;
    }) => {
      void options;
      const id = `created-${rows.size + 1}`;
      model.row(id, { blank: true, updatedAt: Date.now() });
      listListeners.notify();
      return id as SessionId;
    },
    subagentAddress: () => undefined,
    refreshProjections: async () => undefined,
    refresh: async () => {
      listListeners.notify();
    },
    search: async () => ({ ok: true as const, value: { items: [], hasMore: false } }),
    fork: async () => "forked" as SessionId,
    scope: () => undefined,
    scopeOf: () => undefined,
    sessionOf: () => undefined,
    binding: (id: string) => (sessions.has(id) ? ({ sessionId: id } as never) : undefined),
    prompts: [] as ScriptedPrompt[],
    onPrompt: undefined as ((prompt: ScriptedPrompt) => void) | undefined,
    onCancel: undefined as ((sessionId: string) => void) | undefined,
    queueEdits: [] as ScriptedQueueEdit[],
    cancels: [] as string[],
    olderLoads: [] as string[],
    row(id: string, fields: { blank?: boolean; updatedAt?: number; running?: boolean } = {}) {
      const prev = rows.get(id) ?? { blank: false, updatedAt: 0, running: false };
      rows.set(id, { ...prev, ...fields });
      fake(id);
      listListeners.notify();
    },
    update(id: string, change: ScriptedUpdate) {
      const entry = fake(id);
      if (change.kind === "replace") entry.window.replace(change.entries, change.hasMore);
      else if (change.kind === "prepend") entry.window.prepend(change.entries, change.hasMore);
      else entry.window.append(change.entry);
      setSnapshot(entry, { hasMore: entry.window.getSnapshot().hasMore });
    },
    running(id: string, running: boolean) {
      const entry = fake(id);
      setSnapshot(entry, { running });
      rows.set(id, { ...(rows.get(id) ?? { blank: false, updatedAt: 0 }), running });
      listListeners.notify();
    },
    inbox(id: string, items: readonly { id: string; rpcId?: string; text: string }[]) {
      setProjection(fake(id), "inbox", {
        "next-turn": items.map((item) => ({
          id: item.id,
          content: [{ type: "text", text: item.text }],
          source: { kind: "user-rpc", rpcId: item.rpcId },
        })),
        "next-step": [],
      });
    },
    loadingOlder(id: string, loading: boolean) {
      setSnapshot(fake(id), { loadingOlder: loading });
    },
    older(id: string, page: { entries: readonly SessionEventLikeEntry[]; hasMore: boolean }) {
      olderPages.set(id, page);
    },
  };

  for (const id of ids) model.row(id);
  return model as unknown as ScriptedSessions;
}

/** The Connection commands a Controller calls, over a scripted Session model. */
export function scriptedHost(sessions: ScriptedSessions): SessionHost & {
  selected: { sessionId: string; provider: string; model: string; reasoningEffort?: string }[];
  created: { workspaceId?: string; agentPreset?: string }[];
  catalogs: number;
} {
  const host = {
    ready: true,
    sessions,
    workspaces: {} as never,
    selected: [] as {
      sessionId: string;
      provider: string;
      model: string;
      reasoningEffort?: string;
    }[],
    created: [] as { workspaceId?: string; agentPreset?: string }[],
    catalogs: 0,
    createSession: async (request: { workspaceId?: string; agentPreset?: string }) => {
      host.created.push(request);
      const id = await sessions.create(request as never);
      return { sessionId: String(id) };
    },
    modelCatalog: async () => {
      host.catalogs += 1;
      return {
        default: { provider: "p", model: "m" },
        models: [{ provider: "p", providerName: "P", model: "m", name: "Model M" }],
        failures: [],
      };
    },
    selectModel: async (request: {
      sessionId: string;
      provider: string;
      model: string;
      reasoningEffort?: string;
    }) => {
      host.selected.push(request);
    },
    selectAgentPreset: async () => "standard",
    renameSession: async () => undefined,
    uploadFile: async () => ({ receiptId: "receipt" }),
    approvals: () => undefined,
    dispose: async () => undefined,
  };
  return host as unknown as SessionHost & { selected: []; created: []; catalogs: number };
}
