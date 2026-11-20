// The Carrier over a scripted Runner: HTTP and WebSocket both ride one
// tunnel, and every failure ends the streams that were in flight.

import { expect, test } from "nsh/test";

import { publicId, randomBytes } from "./bytes";
import { createRelayCarrier, type RelayCarrier, type RelaySocket } from "./carrier";
import { RelayError } from "./errors";
import { generateKeyPair, type KeyPair } from "./noise";
import { DEVICE_IDENTITY_KEY, PAIRING_KEY, type Pairing, type StorageLike } from "./pairing";
import { FakeBridge } from "./test-support/fake-bridge";

class FakeStorage implements StorageLike {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

interface Setup {
  bridge: FakeBridge;
  carrier: RelayCarrier;
  identity: KeyPair;
  pairing: Pairing;
  storage: FakeStorage;
}

function setup(
  options: {
    storage?: FakeStorage;
    answerHttp?: boolean;
    wsFragments?: number;
    revoked?: boolean;
    respondHttp?: ConstructorParameters<typeof FakeBridge>[0]["respondHttp"];
  } = {},
): Setup {
  const runner = generateKeyPair();
  const identity = generateKeyPair();
  const pairing: Pairing = {
    relayUrl: "http://relay.test",
    runnerId: publicId(randomBytes(32)),
    runnerKey: runner.publicKey,
    deviceId: publicId(identity.publicKey),
  };
  const bridge = new FakeBridge({
    mode: "daily",
    runner,
    runnerId: pairing.runnerId,
    identity,
    answerHttp: options.answerHttp,
    wsFragments: options.wsFragments,
    revoked: options.revoked,
    respondHttp: options.respondHttp,
  });
  const carrier = createRelayCarrier({
    pairing,
    identity,
    storage: options.storage,
    connect: bridge.connector,
    pingIntervalMs: 10_000,
  });
  return { bridge, carrier, identity, pairing, storage: options.storage ?? new FakeStorage() };
}

function once(target: EventTarget, event: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    target.addEventListener(
      event,
      (value) => resolve(value as unknown as Record<string, unknown>),
      { once: true },
    );
  });
}

async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("the expected state never arrived");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function failure(promise: Promise<unknown>): Promise<RelayError> {
  try {
    await promise;
  } catch (error) {
    return error as RelayError;
  }
  throw new Error("expected the promise to reject");
}

test("fetch sends an HTTP request and streams the response", async () => {
  const { bridge, carrier } = setup();
  const body = "x".repeat(40_000);
  const response = await carrier.fetch("https://relay.invalid/api/echo?x=1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(await response.json()).toEqual({ method: "POST", path: "/api/echo?x=1", body });
  expect(bridge.requests).toHaveLength(1);
  expect(bridge.requests[0].bodyFrames).toBeGreaterThan(1);
  carrier.close();
});

test("a websocket carries text and binary, reassembling fragments", async () => {
  const { carrier } = setup({ wsFragments: 3 });
  const socket: RelaySocket = carrier.createWebSocket("https://relay.invalid/api/remote.mux?x=1");
  await once(socket, "open");
  expect(socket.protocol).toBeNull();

  const text = once(socket, "message");
  socket.send("hello 世界");
  expect((await text).data).toBe("hello 世界");

  const binary = once(socket, "message");
  const bytes = new Uint8Array(100).map((_, index) => index);
  socket.send(bytes);
  expect((await binary).data).toEqual(bytes);

  socket.close();
  carrier.close();
});

test("an in-flight request fails when the tunnel drops", async () => {
  const { bridge, carrier } = setup({ answerHttp: false });
  const request = carrier.fetch("https://relay.invalid/api/slow", {
    method: "POST",
    body: "waiting",
  });
  while (bridge.requests.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));

  await bridge.relay.close(4001);
  const error = await failure(request);
  expect(error.code).toBe("runner-offline");
  carrier.close();
});

test("a revoked device loses its stored pairing", async () => {
  const storage = new FakeStorage();
  await storage.setItem(DEVICE_IDENTITY_KEY, "device-key");
  await storage.setItem(PAIRING_KEY, "pairing");
  const { bridge, carrier } = setup({ storage, answerHttp: false });
  const request = carrier.fetch("https://relay.invalid/api/echo", { method: "POST", body: "x" });
  while (bridge.requests.length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
  bridge.control("revoked");

  const error = await failure(request);
  expect(error.code).toBe("device-revoked");
  await new Promise((resolve) => setTimeout(resolve, 1));
  expect(await storage.getItem(PAIRING_KEY)).toBeNull();
  carrier.close();
});

test("a revoked device loses its pairing when the handshake says so", async () => {
  const storage = new FakeStorage();
  await storage.setItem(PAIRING_KEY, "pairing");
  const { carrier } = setup({ storage, revoked: true });

  const error = await failure(carrier.fetch("https://relay.invalid/api/echo"));
  expect(error.code).toBe("device-revoked");
  expect(await storage.getItem(PAIRING_KEY)).toBeNull();
  carrier.close();
});

test("the relay records no plaintext path or body", async () => {
  const { bridge, carrier } = setup();
  const path = "/api/secret-path-token";
  const body = "secret-body-token";
  await carrier.fetch(`https://relay.invalid${path}`, {
    method: "POST",
    body,
    headers: { "content-type": "text/plain" },
  });
  const socket = carrier.createWebSocket("https://relay.invalid/api/remote.mux");
  await once(socket, "open");
  socket.send("secret-ws-token");
  await once(socket, "message");

  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (const message of bridge.relay.wire) {
    const text = decoder.decode(message);
    expect(text).not.toContain("secret-path-token");
    expect(text).not.toContain("secret-body-token");
    expect(text).not.toContain("secret-ws-token");
  }
  socket.close();
  carrier.close();
});

test("an aborted fetch resets its stream once", async () => {
  const { bridge, carrier } = setup({ answerHttp: false });
  const controller = new AbortController();
  const work = failure(
    carrier.fetch("https://relay.invalid/api/slow", { signal: controller.signal }),
  );
  await until(() => bridge.requests.length > 0);

  controller.abort();

  const error = await work;
  expect(error.name).toBe("AbortError");
  expect(bridge.resets).toEqual([{ stream: 1, code: { code: "cancelled" } }]);
  carrier.close();
});

test("an abort after the response headers resets its stream", async () => {
  const { bridge, carrier } = setup({
    respondHttp: () => ({ status: 200, body: "first", hold: true }),
  });
  const controller = new AbortController();
  const response = await carrier.fetch("https://relay.invalid/api/slow", {
    signal: controller.signal,
  });
  expect(response.status).toBe(200);

  controller.abort();

  expect((await failure(response.text())).name).toBe("AbortError");
  expect(bridge.resets).toEqual([{ stream: 1, code: { code: "cancelled" } }]);
  carrier.close();
});

test("cancelling the response body resets its stream", async () => {
  const { bridge, carrier } = setup({
    respondHttp: () => ({ status: 200, body: "first", hold: true }),
  });
  const response = await carrier.fetch("https://relay.invalid/api/slow");

  await response.body?.cancel();

  expect(bridge.resets).toEqual([{ stream: 1, code: { code: "cancelled" } }]);
  carrier.close();
});
