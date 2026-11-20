/**
 * DSH loopback auth bootstrap for dsh-bot.
 * fetch `/connect?token=…` with Cookie → open `ws://127.0.0.1…/api/remote.mux`.
 */

import { t } from "../i18n";

export type DshLogin = {
  origin: string;
  cookie: string;
};

/**
 * The options every dsh HTTP call on this Client carries.
 *
 * The platform's shared cookie jar must never reach dsh. NSH's `fetch` sends
 * the system jar by default, dsh mints a fresh `dsh-auth-<random>` cookie on
 * every `/connect`, and the jar replays every one of them: after a normal
 * number of reconnects a Client sent 57 stale cookies (16 KB) and dsh answered
 * `431 Request Header Fields Too Large`. On NSH's native stack `credentials:
 * "omit"` alone does **not** stop that — an explicit `Cookie` header does, and
 * an empty one suppresses the jar without naming any cookie. The session
 * cookie dsh hands us is passed here instead, so nothing depends on that jar.
 *
 * @param cookie - the `/connect` cookie, or `null` before there is one.
 * @param init - the call's own options; its headers are kept.
 * @returns the call's options with the ambient jar switched off.
 */
export function dshRequestInit(cookie: string | null, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie ?? "");
  return { ...init, headers, credentials: "omit" };
}

/**
 * Prefer explicit argument, then Host `connectionInfo` (async path via `resolveDshLoginUrl`),
 * then `DSH_BOT_LOGIN_URL` for manual smoke without Host.
 */
export function resolveLoginUrl(explicit?: string): string {
  const fromEnv =
    typeof process !== "undefined" &&
    process.env &&
    typeof process.env.DSH_BOT_LOGIN_URL === "string"
      ? process.env.DSH_BOT_LOGIN_URL
      : undefined;
  const url = explicit?.trim() || fromEnv;
  if (!url) {
    throw new Error(t("dsh.auth.noLoginUrl"));
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
    throw new Error(t("dsh.auth.loopbackOnly"));
  }
  const token = login.searchParams.get("token");
  if (!token) throw new Error(t("dsh.auth.noToken"));

  const url = new URL("/connect", login);
  url.searchParams.set("token", token);
  url.searchParams.set("interactions", "answer");

  const response = await fetch(url.toString(), {
    ...dshRequestInit(null),
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
    throw new Error(t("dsh.auth.failed", { status: response.status }));
  }
  return { origin: login.origin, cookie };
}

/** Build the mux URL for the loopback dsh origin. */
export function muxWebSocketUrl(origin: string): string {
  const target = new URL("/api/remote.mux", origin);
  target.protocol = "ws:";
  return target.toString();
}
