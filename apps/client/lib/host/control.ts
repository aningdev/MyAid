/**
 * Product-facing Host control. Native adapter returns system facts;
 * TypeScript decides product branches.
 */
import { HostControl } from "myaid/native";

import { decodeBackendInfo, decodeHostStatus, type HostStatus } from "./protocol";

export type { HostStatus };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const hostAccess = {
  reachable: () => HostControl.reachable(),

  status: async (): Promise<HostStatus> =>
    decodeHostStatus(await HostControl.request("status", "")),

  ensure: async (source: "attach" | "userStart"): Promise<HostStatus> =>
    decodeHostStatus(await HostControl.request("ensureDsh", source)),

  /** Explicit / auto start — awaits Host ensureDsh(userStart). */
  start: async (): Promise<HostStatus> => hostAccess.ensure("userStart"),

  stop: async (): Promise<HostStatus> => decodeHostStatus(await HostControl.request("stopDsh", "")),

  restart: async (): Promise<HostStatus> =>
    decodeHostStatus(await HostControl.request("restartDsh", "")),

  /** Ready login URL with token — only call after phase is ready. */
  connectionInfo: async (): Promise<HostStatus> =>
    decodeBackendInfo(await HostControl.request("connectionInfo", "")),
};

/** Start dsh if needed and wait until Host reports ready (or fail). */
export async function ensureBackendReady(timeoutMs = 60_000): Promise<HostStatus> {
  if (!(await hostAccess.reachable())) {
    throw new Error(
      "宿主未运行：请用仓库根目录 bun run dev（会自动起 Host），或单独 cargo run -p myaid-host -- serve-app",
    );
  }
  let status = await hostAccess.status();
  if (status.phase !== "ready") {
    status = await hostAccess.start();
  }
  if (status.phase === "ready") return status;

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(100);
    status = await hostAccess.status();
    if (status.phase === "ready") return status;
    if (status.phase === "failed") {
      throw new Error(status.reason?.trim() || "后台启动失败");
    }
  }
  throw new Error(
    status.reason?.trim()
      ? `等待后台就绪超时（${status.phase}）：${status.reason}`
      : `等待后台就绪超时（${status.phase}）`,
  );
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

export async function watchHostStatus(listener: (status: HostStatus) => void): Promise<() => void> {
  if (!(await hostAccess.reachable())) return () => {};
  const watch = await HostControl.watch();
  let closed = false;
  void (async () => {
    try {
      while (!closed) {
        const status = decodeHostStatus(await watch.read());
        if (!closed) listener(status);
      }
    } catch (error) {
      if (!closed) {
        listener({
          phase: "unavailable",
          blocked: true,
          version: "",
          reason: `后台宿主连接不可用：${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } finally {
      watch.close();
    }
  })();
  return () => {
    closed = true;
    watch.close();
  };
}
