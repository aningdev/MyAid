/**
 * DSH loopback auth bootstrap for MyAid (NSH 0.4).
 * Pattern from dsh-bot `frontend/infrastructure/dsh/connection.ts`:
 * fetch `/connect?token=…` with Cookie → open `ws://127.0.0.1…/api/remote.mux`.
 */
import { connect as standardConnect } from "websocket";

import { AuthenticatedSocket } from "./socket";

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

/** Build the mux URL the native CookieWebSocket accepts. */
export function muxWebSocketUrl(origin: string): string {
  const target = new URL("/api/remote.mux", origin);
  target.protocol = "ws:";
  return target.toString();
}

/**
 * Prove NSH 0.4 still blocks Cookie on the standard handshake.
 * Expected: TypeError / message mentioning credential header `Cookie`.
 */
export async function assertStandardCookieHandshakeBlocked(muxUrl: string): Promise<string> {
  let rejection = "";
  try {
    const socket = await standardConnect(muxUrl, { headers: { Cookie: "probe=1" } });
    try {
      await socket.close();
    } finally {
      socket.dispose();
    }
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  if (!/cookie/i.test(rejection) && !/credential/i.test(rejection)) {
    throw new Error(
      `Expected standard websocket.connect to refuse Cookie; got: ${rejection || "(opened unexpectedly)"}`,
    );
  }
  return rejection;
}

/** Open authenticated mux via native CookieWebSocket (EventTarget wrapper). */
export function openAuthenticatedMux(origin: string, cookie: string): AuthenticatedSocket {
  return new AuthenticatedSocket(muxWebSocketUrl(origin), cookie);
}

/**
 * Full smoke: standard WS+Cookie must fail; CookieWebSocket after /connect must open.
 * Does not mount the official dsh Gateway — only proves the transport gap fill.
 */
export async function smokeDshAuthTransport(loginUrl?: string): Promise<{
  standardRejection: string;
  cookieBytes: number;
  muxUrl: string;
}> {
  const login = resolveLoginUrl(loginUrl);
  const muxUrl = muxWebSocketUrl(new URL(login).origin);
  const standardRejection = await assertStandardCookieHandshakeBlocked(muxUrl);
  const { origin, cookie } = await fetchSessionCookie(login);
  const socket = openAuthenticatedMux(origin, cookie);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CookieWebSocket open timed out")), 10_000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CookieWebSocket failed to open"));
    });
  });
  return { standardRejection, cookieBytes: cookie.length, muxUrl };
}
