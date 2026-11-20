/**
 * The Host's HTTP transport: the route each op takes, the token every call carries, the frames
 * it decodes, and the websocket subscription. Every transport here is a fake; nothing listens.
 */
import { expect, test } from "nsh/test";

import { t } from "../i18n";
import { createHostTransport, probeHost, type HostSocket } from "./client";
import type { HostStatus } from "./protocol";

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

function reply(body: unknown, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status < 400,
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}

/** A fetch a test hands in: the seam's signature, a fake's body. */
type FakeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function headersOf(init: RequestInit | undefined): Record<string, string> {
  return (init?.headers ?? {}) as Record<string, string>;
}

function recorder(respond: (call: Call) => unknown) {
  const calls: Call[] = [];
  const fetch: FakeFetch = async (url, init) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: headersOf(init),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    const answer = respond(call);
    return answer instanceof Object && "ok" in (answer as object)
      ? (answer as Response)
      : reply(answer);
  };
  return { calls, fetch };
}

function status(phase: string, extra: Partial<HostStatus> = {}): HostStatus {
  return {
    phase,
    version: "test",
    blocked: phase !== "ready",
    generation: phase === "ready" ? "g1" : null,
    pid: phase === "ready" ? 1 : null,
    reason: null,
    url: null,
    ...extra,
  };
}

test("a status call carries this data root's token and decodes the frame", async () => {
  const { calls, fetch } = recorder(() => status("ready"));
  const transport = createHostTransport({ token: async () => "tok", fetch, port: () => 4873 });
  const reported = await transport.call({ op: "status" });
  expect(reported.phase).toBe("ready");
  expect(calls.length).toBe(1);
  expect(calls[0]?.url).toBe("http://127.0.0.1:4873/status");
  expect(calls[0]?.method).toBe("GET");
  expect(calls[0]?.headers.Authorization).toBe("Bearer tok");
});

test("each op takes its own route", async () => {
  const { calls, fetch } = recorder((call) =>
    call.url.endsWith("/connection")
      ? status("ready", { url: "http://127.0.0.1:9876/?token=secret" })
      : status("ready"),
  );
  const transport = createHostTransport({ token: async () => "tok", fetch, port: () => 4873 });
  await transport.call({ op: "status" });
  await transport.call({ op: "ensureDsh", source: "userStart" });
  await transport.call({ op: "stopDsh" });
  await transport.call({ op: "restartDsh" });
  await transport.call({ op: "connectionInfo" });
  expect(
    calls.map((call) => `${call.method} ${call.url.replace("http://127.0.0.1:4873", "")}`),
  ).toEqual([
    "GET /status",
    "POST /dsh/start",
    "POST /dsh/stop",
    "POST /dsh/restart",
    "GET /connection",
  ]);
  expect(calls[1]?.body).toBe(JSON.stringify({ source: "userStart" }));
  expect(calls[1]?.headers["Content-Type"]).toBe("application/json");
});

test("a Host error body becomes the thrown message", async () => {
  const { fetch } = recorder(() => reply({ error: "dsh 启动前退出" }, 500));
  const transport = createHostTransport({ token: async () => "tok", fetch, port: () => 4873 });
  await expect(transport.call({ op: "ensureDsh", source: "userStart" })).rejects.toThrow(
    /dsh 启动前退出/,
  );
});

test("a caller without a token still asks, and the Host refuses it", async () => {
  const { calls, fetch } = recorder(() => reply({ error: "refused" }, 401));
  const transport = createHostTransport({ token: async () => null, fetch, port: () => 4873 });
  await expect(transport.call({ op: "status" })).rejects.toThrow(/refused/);
  expect(calls[0]?.headers.Authorization).toBeUndefined();
});

test("the probe needs the liveness text, not just an answer", async () => {
  const yes = recorder(() => "dsh-bot");
  expect(await probeHost(4873, yes.fetch, 100)).toBe(true);
  const no = recorder(() => "<html>something else</html>");
  expect(await probeHost(4873, no.fetch, 100)).toBe(false);
  const refused: FakeFetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  expect(await probeHost(4873, refused, 100)).toBe(false);
});

test("the watch subscription carries the token in its query and decodes frames", async () => {
  let opened: { url: string; socket: HostSocket } | undefined;
  const transport = createHostTransport({
    token: async () => "tok",
    port: () => 4873,
    fetch: (async () => reply(status("stopped"))) as FakeFetch,
    socket: (url) => {
      const socket: HostSocket = {
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        close: () => undefined,
      };
      opened = { url, socket };
      return socket;
    },
  });
  const seen: HostStatus[] = [];
  const down: string[] = [];
  const stop = await transport.watch(
    (next) => seen.push(next),
    (reason) => down.push(reason),
  );
  expect(opened?.url).toBe("ws://127.0.0.1:4873/watch?token=tok");
  opened?.socket.onmessage?.({ data: JSON.stringify(status("stopped")) });
  opened?.socket.onmessage?.({ data: JSON.stringify(status("ready")) });
  expect(seen.map((frame) => frame.phase)).toEqual(["stopped", "ready"]);
  expect(down).toEqual([]);
  stop();
});

test("a watch without a token reports down instead of opening a socket", async () => {
  let sockets = 0;
  const transport = createHostTransport({
    token: async () => null,
    port: () => 4873,
    fetch: (async () => reply(status("stopped"))) as FakeFetch,
    socket: () => {
      sockets += 1;
      throw new Error("should not open");
    },
  });
  const down: string[] = [];
  await transport.watch(
    () => undefined,
    (reason) => down.push(reason),
  );
  expect(sockets).toBe(0);
  expect(down[0]).toContain(t("host.error.noToken"));
});
