/**
 * Product HostControl: typed ops over the Host's loopback HTTP API, a decoded HostStatus, and
 * watch-based ensureReady. The transport is `lib/host/client.ts`; a test injects a fake.
 */
import { createHostTransport, type EnsureSource, type HostOp, type HostTransport } from "./client";
import { decodeHostStatus, type HostStatus, type HostView } from "./protocol";

export type { EnsureSource, HostOp, HostStatus, HostTransport, HostView };

/** The message every "no Host" path carries, with the command that starts one by hand. */
export const HOST_NOT_RUNNING =
  "宿主未运行：请运行 bun run dev（会自动起 Host），或单独 cargo run -p myaid-host -- serve-app";

let transport: HostTransport = createHostTransport();

/** Tests inject a fake HostTransport; production talks to the Host's HTTP API. */
export function setHostTransport(next: HostTransport | null): void {
  transport = next ?? createHostTransport();
}

export const hostAccess = {
  reachable: () => transport.reachable(),

  status: (): Promise<HostStatus> => transport.call({ op: "status" }),

  ensure: (source: EnsureSource): Promise<HostStatus> =>
    transport.call({ op: "ensureDsh", source }),

  start: (): Promise<HostStatus> => transport.call({ op: "ensureDsh", source: "userStart" }),

  stop: (): Promise<HostStatus> => transport.call({ op: "stopDsh" }),

  restart: (): Promise<HostStatus> => transport.call({ op: "restartDsh" }),

  connectionInfo: (): Promise<HostStatus> => transport.call({ op: "connectionInfo" }),
};

/**
 * Start dsh if needed and wait until Host reports ready (or fail).
 * Uses watch when available; falls back to status polling only if watch cannot open.
 */
export async function ensureBackendReady(timeoutMs = 60_000): Promise<HostStatus> {
  if (!(await hostAccess.reachable())) {
    throw new Error(HOST_NOT_RUNNING);
  }

  let status = await hostAccess.status();
  if (status.phase === "ready") return status;
  if (status.phase !== "ready") {
    status = await hostAccess.start();
  }
  if (status.phase === "ready") return status;
  if (status.phase === "failed") {
    throw new Error(status.reason?.trim() || "后台启动失败");
  }

  return await new Promise<HostStatus>((resolve, reject) => {
    let settled = false;
    let stopWatch: (() => void) | undefined;
    const finish = (value: HostStatus | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stopWatch?.();
      if (value instanceof Error) reject(value);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      finish(
        new Error(
          status.reason?.trim()
            ? `等待后台就绪超时（${status.phase}）：${status.reason}`
            : `等待后台就绪超时（${status.phase}）`,
        ),
      );
    }, timeoutMs);

    void transport
      .watch(
        (next) => {
          status = next;
          if (next.phase === "ready") finish(next);
          else if (next.phase === "failed") {
            finish(new Error(next.reason?.trim() || "后台启动失败"));
          }
        },
        (reason) => finish(new Error(reason)),
      )
      .then((stop) => {
        stopWatch = stop;
        if (settled) stop();
      })
      .catch((error) => {
        finish(error instanceof Error ? error : new Error(String(error)));
      });
  });
}

/** Prefer Host `connectionInfo`; fall back to `MYAID_DSH_LOGIN_URL` for manual smoke. */
export async function resolveDshLoginUrl(): Promise<string> {
  let reachable = false;
  try {
    reachable = await hostAccess.reachable();
  } catch {
    reachable = false;
  }

  if (reachable) {
    try {
      await ensureBackendReady();
      const info = await hostAccess.connectionInfo();
      if (info.url) return info.url;
      throw new Error("宿主未返回登录地址");
    } catch (error) {
      if (
        error instanceof Error &&
        (/宿主未|后台启动|等待后台/.test(error.message) || error.message === HOST_NOT_RUNNING)
      ) {
        throw error;
      }
      throw new Error(
        `无法向宿主索取登录地址：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const fromEnv =
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env.MYAID_DSH_LOGIN_URL === "string"
      ? process.env.MYAID_DSH_LOGIN_URL.trim()
      : "";
  if (fromEnv) return fromEnv;
  throw new Error(HOST_NOT_RUNNING);
}

/**
 * Subscribe to public Host status.
 * On connection loss, calls `onDown` — does not forge a Host phase.
 */
export async function watchHostStatus(
  listener: (status: HostStatus) => void,
  onDown?: (reason: string) => void,
): Promise<() => void> {
  return transport.watch(listener, (reason) => onDown?.(reason));
}

/** Exported for the tests that decode a Host frame without a transport. */
export { decodeHostStatus };
