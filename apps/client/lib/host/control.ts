/**
 * Product HostControl module: typed ops, decoded HostStatus, watch-based ensureReady.
 * Native HostControl is a thin adapter behind `HostTransport`.
 */
import { HostControl } from "myaid/native";

import { decodeBackendInfo, decodeHostStatus, type HostStatus, type HostView } from "./protocol";

export type { HostStatus, HostView };

export type EnsureSource = "attach" | "userStart";

export type HostOp =
  | { op: "status" }
  | { op: "ensureDsh"; source: EnsureSource }
  | { op: "stopDsh" }
  | { op: "restartDsh" }
  | { op: "connectionInfo" };

/** Seam for the native HostControl adapter (or a test fake). */
export type HostTransport = {
  reachable(): Promise<boolean>;
  call(op: HostOp): Promise<HostStatus>;
  watch(
    onStatus: (status: HostStatus) => void,
    onDown: (reason: string) => void,
  ): Promise<() => void>;
};

function nativeCall(op: HostOp): Promise<string> {
  switch (op.op) {
    case "status":
      return HostControl.request("status", "");
    case "ensureDsh":
      return HostControl.request("ensureDsh", op.source);
    case "stopDsh":
      return HostControl.request("stopDsh", "");
    case "restartDsh":
      return HostControl.request("restartDsh", "");
    case "connectionInfo":
      return HostControl.request("connectionInfo", "");
  }
}

const nativeTransport: HostTransport = {
  reachable: () => HostControl.reachable(),
  call: async (op) => {
    const raw = await nativeCall(op);
    return op.op === "connectionInfo" ? decodeBackendInfo(raw) : decodeHostStatus(raw);
  },
  watch: async (onStatus, onDown) => {
    if (!(await HostControl.reachable())) {
      onDown("宿主未运行");
      return () => {};
    }
    const watch = await HostControl.watch();
    let closed = false;
    void (async () => {
      try {
        while (!closed) {
          const status = decodeHostStatus(await watch.read());
          if (!closed) onStatus(status);
        }
      } catch (error) {
        if (!closed) {
          onDown(`后台宿主连接不可用：${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        watch.close();
      }
    })();
    return () => {
      closed = true;
      watch.close();
    };
  },
};

let transport: HostTransport = nativeTransport;

/** Tests inject a fake HostTransport; production uses native. */
export function setHostTransport(next: HostTransport | null): void {
  transport = next ?? nativeTransport;
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
    throw new Error(
      "宿主未运行：请用仓库根目录 bun run dev（会自动起 Host），或单独 cargo run -p myaid-host -- serve-app",
    );
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
      if (error instanceof Error && /宿主未|后台启动|等待后台/.test(error.message)) throw error;
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
  throw new Error(
    "宿主未运行：请用仓库根目录 bun run dev（会自动起 Host），或单独 cargo run -p myaid-host -- serve-app",
  );
}

/**
 * Subscribe to public Host status.
 * On socket loss, calls `onDown` — does not forge a Host phase.
 */
export async function watchHostStatus(
  listener: (status: HostStatus) => void,
  onDown?: (reason: string) => void,
): Promise<() => void> {
  return transport.watch(listener, (reason) => onDown?.(reason));
}
