/**
 * The Host's control API over loopback HTTP, with a websocket for status.
 *
 * The Host listens on `127.0.0.1:<port>` and takes `Authorization: Bearer <token>` on every
 * route but `/`, which answers `myaid` so a probe can tell "a Host answers" from "nothing does".
 * The token is `serve-token` in this app's data root: the Host makes it once it holds the port,
 * and the Client reads it on each connection, so a Host it started and one it found running both
 * take it. The websocket carries the token in its query, since the standard WebSocket API sets
 * no request headers.
 */
import { readFile } from "fs/promises";
import { join } from "path";

import { dataRootPath, hostControlAllowed } from "../data-root";
import { t } from "../i18n";
import { decodeBackendInfo, decodeHostStatus, type HostStatus } from "./protocol";

/** The control port when nothing names one (`MYAID_HOST_PORT`, which the Host honours too). */
export const DEFAULT_HOST_PORT = 4872;

/** What a test app's transport says instead of reaching the person's machine. */
/** Why a test app stays off the control plane (read at the throw, in the app's language). */
export function noControlInTest(): string {
  return t("test.noControl");
}

export type EnsureSource = "attach" | "userStart";

export type HostOp =
  | { op: "status" }
  | { op: "ensureDsh"; source: EnsureSource }
  | { op: "stopDsh" }
  | { op: "restartDsh" }
  | { op: "connectionInfo" };

/** What the product calls: one seam a test can replace with a fake. */
export type HostTransport = {
  reachable(): Promise<boolean>;
  call(op: HostOp): Promise<HostStatus>;
  watch(
    onStatus: (status: HostStatus) => void,
    onDown: (reason: string) => void,
  ): Promise<() => void>;
};

/** The part of a WebSocket this module reads. */
export type HostSocket = {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
};

/** Everything a transport reaches the Host with; a test replaces what it needs. */
export type HostSeams = {
  port(): number;
  token(): Promise<string | null>;
  fetch: typeof fetch;
  socket(url: string): HostSocket;
  /** How long a liveness probe waits before it calls the Host absent. */
  probeTimeoutMs: number;
  /** Whether this app may reach the control plane at all (`lib/data-root.ts`); a test replaces it. */
  allow(): boolean;
};

/** The control port in force: `MYAID_HOST_PORT`, else this build's default. */
export function hostPort(): number {
  const raw = typeof process !== "undefined" && process.env ? process.env.MYAID_HOST_PORT : "";
  const port = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_HOST_PORT;
}

/** `~/.myaid/host/serve-token`, or null before a Host has ever held the port. */
export async function hostToken(root: string = dataRootPath()): Promise<string | null> {
  try {
    const token = (await readFile(join(root, "host", "serve-token"), "utf8")).trim();
    return token ? token : null;
  } catch {
    return null;
  }
}

export function hostBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function withTimeout<T>(work: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(reason)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Whether a Host answers on the port: the liveness text, with no token. A refused connection,
 * a timeout, or anything that is not `myaid` means no Host of ours is there.
 */
export async function probeHost(
  port: number,
  request: typeof fetch = fetch,
  timeoutMs = 1500,
): Promise<boolean> {
  try {
    const response = await withTimeout(
      request(`${hostBaseUrl(port)}/`, { method: "GET" }),
      timeoutMs,
      t("host.error.probeTimeout"),
    );
    if (!response.ok) return false;
    return (await response.text()).trim() === "myaid";
  } catch {
    return false;
  }
}

/** One refusal or failure as an Error the panels can word. */
async function failure(response: Response, path: string): Promise<Error> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return new Error(body.error);
  } catch {
    // Not a Host error body: fall through to the status line.
  }
  return new Error(t("host.error.request", { path, status: response.status }));
}

/** The HTTP transport the product uses; tests pass their own seams. */
export function createHostTransport(overrides: Partial<HostSeams> = {}): HostTransport {
  const seams: HostSeams = {
    port: hostPort,
    token: () => hostToken(),
    fetch,
    socket: (url) => new WebSocket(url) as unknown as HostSocket,
    probeTimeoutMs: 1500,
    allow: hostControlAllowed,
    ...overrides,
  };

  const call = async (
    path: string,
    init: { method: string; body?: unknown } = { method: "GET" },
  ): Promise<Response> => {
    const token = await seams.token();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    const response = await seams.fetch(`${hostBaseUrl(seams.port())}${path}`, {
      method: init.method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!response.ok) throw await failure(response, path);
    return response;
  };

  const get = async (path: string, decode: (raw: string) => HostStatus): Promise<HostStatus> =>
    decode(await (await call(path)).text());

  const post = async (path: string, body: unknown): Promise<HostStatus> =>
    decodeHostStatus(await (await call(path, { method: "POST", body })).text());

  return {
    // A test app never probes: the real Host may be listening on this port, with the real data
    // root, and a test has no business reading it (`lib/data-root.ts`).
    reachable: () =>
      seams.allow()
        ? probeHost(seams.port(), seams.fetch, seams.probeTimeoutMs)
        : Promise.resolve(false),

    call: async (op) => {
      if (!seams.allow()) throw new Error(noControlInTest());
      switch (op.op) {
        case "status":
          return get("/status", decodeHostStatus);
        case "connectionInfo":
          return get("/connection", decodeBackendInfo);
        case "ensureDsh":
          return post("/dsh/start", { source: op.source });
        case "stopDsh":
          return post("/dsh/stop", {});
        case "restartDsh":
          return post("/dsh/restart", {});
      }
    },

    watch: async (onStatus, onDown) => {
      if (!seams.allow()) {
        onDown(noControlInTest());
        return () => {};
      }
      const token = await seams.token();
      if (!token) {
        onDown(t("host.error.noToken"));
        return () => {};
      }
      const socket = seams.socket(
        `ws://127.0.0.1:${seams.port()}/watch?token=${encodeURIComponent(token)}`,
      );
      let closed = false;
      socket.onmessage = (event) => {
        if (closed) return;
        try {
          onStatus(decodeHostStatus(String(event.data)));
        } catch (error) {
          onDown(
            t("host.error.badStatusFrame", {
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      };
      socket.onerror = () => {
        if (!closed) onDown(t("host.error.watchUnavailable"));
      };
      socket.onclose = () => {
        if (!closed) onDown(t("host.error.watchClosed"));
      };
      return () => {
        closed = true;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      };
    },
  };
}
