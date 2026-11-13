/**
 * The `/connect` handshake must never lean on the platform's cookie jar.
 *
 * NSH's `fetch` sends the shared jar by default; dsh mints a fresh
 * `dsh-auth-<random>` cookie on every `/connect`, so a Client that reconnects
 * often grew the `Cookie` header with every past session — 57 stale cookies,
 * ~16 KB, until dsh answered `431 Request Header Fields Too Large`. These
 * tests pin the two halves of the fix: an explicit Cookie header (empty before
 * there is one) keeps the jar off the wire, and the only cookie sent is the one
 * dsh just handed us.
 */
import { expect, test } from "nsh/test";

import { dshRequestInit, fetchSessionCookie } from "./auth";

type Call = { url: string; init: RequestInit };

/** Replace `fetch` for one call; returns the calls it saw. */
async function withFetch<T>(
  run: () => Promise<T>,
  answer: () => Response,
): Promise<{ calls: Call[]; value?: T; error?: unknown }> {
  const globals = globalThis as unknown as { fetch: typeof fetch };
  const real = globals.fetch;
  const calls: Call[] = [];
  globals.fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(answer());
  }) as typeof fetch;
  try {
    return { calls, value: await run() };
  } catch (error) {
    return { calls, error };
  } finally {
    globals.fetch = real;
  }
}

function login(): Response {
  const headers = new Headers();
  headers.append("set-cookie", "dsh-auth-probe=v2.payload; Path=/; HttpOnly");
  return new Response(null, { status: 302, headers });
}

test("/connect opts out of the ambient cookie jar", async () => {
  const { calls, value } = await withFetch(
    () => fetchSessionCookie("http://127.0.0.1:9/?token=t0k3n"),
    login,
  );
  expect(calls.length).toBe(1);
  expect(calls[0]?.init.credentials).toBe("omit");
  expect(calls[0]?.init.redirect).toBe("manual");
  expect(calls[0]?.url).toBe("http://127.0.0.1:9/connect?token=t0k3n&interactions=answer");
  // An explicit empty Cookie is what suppresses the platform jar; without it
  // NSH's fetch replays every cookie dsh ever issued (see the module note).
  expect(new Headers(calls[0]?.init.headers).get("cookie")).toBe("");
  expect(value?.cookie).toBe("dsh-auth-probe=v2.payload");
});

test("every API call carries our cookie and no jar cookie", () => {
  const init = dshRequestInit("dsh-auth-a=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  expect(init.credentials).toBe("omit");
  expect(init.method).toBe("POST");
  const headers = new Headers(init.headers);
  expect(headers.get("cookie")).toBe("dsh-auth-a=1");
  expect(headers.get("content-type")).toBe("application/json");
  // A caller's own headers survive, and ours cannot be dropped by accident.
  expect(new Headers(dshRequestInit("a=1", { headers: { "x-y": "z" } }).headers).get("x-y")).toBe(
    "z",
  );
});

test("a login that hands back no cookie is a named failure", async () => {
  const { error } = await withFetch(
    () => fetchSessionCookie("http://127.0.0.1:9/?token=t0k3n"),
    () => new Response(null, { status: 302 }),
  );
  expect(String(error)).toContain("认证失败");
});
