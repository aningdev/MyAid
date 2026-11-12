/**
 * DSH loopback auth bootstrap for MyAid.
 * fetch `/connect?token=…` with Cookie → open `ws://127.0.0.1…/api/remote.mux`.
 */

export type DshLogin = {
  origin: string;
  cookie: string;
};

/**
 * Prefer explicit argument, then Host `connectionInfo` (async path via `resolveDshLoginUrl`),
 * then `MYAID_DSH_LOGIN_URL` for manual smoke without Host.
 */
export function resolveLoginUrl(explicit?: string): string {
  const fromEnv =
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env.MYAID_DSH_LOGIN_URL === "string"
      ? process.env.MYAID_DSH_LOGIN_URL
      : undefined;
  const url = explicit?.trim() || fromEnv;
  if (!url) {
    throw new Error(
      "缺少登录 URL：请先经 Host 启动后台（connectionInfo），或设置 MYAID_DSH_LOGIN_URL",
    );
  }
  return url;
}

/** Exchange Host/dsh login URL for an API Cookie. Token never stored. */
export async function fetchSessionCookie(
  loginUrl: string,
  signal?: AbortSignal,
): Promise<DshLogin> {
  const login = new URL(loginUrl);
  if (login.protocol !== "http:" || login.hostname !== "127.0.0.1") {
    throw new Error("后台地址必须是本机回环地址");
  }
  const token = login.searchParams.get("token");
  if (!token) throw new Error("启动链接缺少认证令牌");

  const url = new URL("/connect", login);
  url.searchParams.set("token", token);
  url.searchParams.set("interactions", "answer");

  const response = await fetch(url.toString(), {
    redirect: "manual",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
  });
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
  if (response.status !== 302 || !cookie) {
    throw new Error(`认证失败：后台返回 ${response.status}，未取得 Cookie`);
  }
  return { origin: login.origin, cookie };
}

/** Build the mux URL for the loopback dsh origin. */
export function muxWebSocketUrl(origin: string): string {
  const target = new URL("/api/remote.mux", origin);
  target.protocol = "ws:";
  return target.toString();
}
