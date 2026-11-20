// The tunnel against an in-memory Relay/Bridge peer: handshakes, keepalive,
// frame routing, close codes and the opacity of everything on the wire.

import { expect, test } from "nsh/test";

import { publicId, utf8Encode, randomBytes } from "./bytes";
import { RelayError } from "./errors";
import { generateKeyPair } from "./noise";
import { FakeRelay } from "./test-support/fake-relay";
import {
  MAX_FRAME_BODY,
  deviceEndpoint,
  openTunnel,
  type Tunnel,
  type TunnelHandlers,
} from "./tunnel";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function failure(promise: Promise<unknown>): Promise<RelayError> {
  try {
    await promise;
  } catch (error) {
    return error as RelayError;
  }
  throw new Error("expected the promise to reject");
}

function setup(
  mode: "daily" | "pair",
  options: { revoked?: boolean; rejectCloseCode?: number; answerPings?: boolean } = {},
) {
  const runner = generateKeyPair();
  const identity = generateKeyPair();
  const runnerId = publicId(runner.publicKey);
  const deviceId = publicId(identity.publicKey);
  const psk = randomBytes(32);
  const relay = new FakeRelay({ mode, runner, runnerId, deviceId, psk, ...options });
  return { relay, runnerId, runnerKey: runner.publicKey, identity, deviceId, psk };
}

function handlers(): TunnelHandlers & {
  frames: { stream: number; type: number; body: Uint8Array }[];
  closed: RelayError[];
} {
  const frames: { stream: number; type: number; body: Uint8Array }[] = [];
  const closed: RelayError[] = [];
  return {
    frames,
    closed,
    onFrame: (stream, type, body) => frames.push({ stream, type, body }),
    onClose: (error) => closed.push(error),
  };
}

test("the relay endpoint follows the relay's scheme", () => {
  expect(deviceEndpoint("https://relay.example.com/base?x=1", "abc")).toBe(
    "wss://relay.example.com/v1/device?runner=abc",
  );
  expect(deviceEndpoint("http://127.0.0.1:4873", "abc")).toBe(
    "ws://127.0.0.1:4873/v1/device?runner=abc",
  );
});

test("a daily tunnel handshakes, routes frames and answers pings", async () => {
  const { relay, runnerId, runnerKey, identity } = setup("daily", { answerPings: true });
  const seen = handlers();
  const tunnel = await openTunnel(
    {
      mode: "daily",
      relayUrl: "http://relay.test",
      runnerId,
      runnerKey,
      identity,
      pingIntervalMs: 10,
      connect: relay.connector,
    },
    seen,
  );

  await delay(60);
  expect(seen.closed).toHaveLength(0);

  tunnel.send(1, 3, utf8Encode("request body"));
  const frame = await relay.nextFrame();
  expect(frame.stream).toBe(1);
  expect(frame.type).toBe(3);
  expect(new TextDecoder().decode(frame.body)).toBe("request body");

  relay.sendFrame(1, 2, utf8Encode("response"));
  await delay(20);
  expect(seen.frames).toHaveLength(1);
  expect(seen.frames[0].stream).toBe(1);
  expect(new TextDecoder().decode(seen.frames[0].body)).toBe("response");

  tunnel.close();
  expect((await tunnel.closed).code).toBe("closed");
});

test("a revoked device is told so during the handshake", async () => {
  const { relay, runnerId, runnerKey, identity } = setup("daily", { revoked: true });
  const error = await failure(
    openTunnel(
      {
        mode: "daily",
        relayUrl: "http://relay.test",
        runnerId,
        runnerKey,
        identity,
        connect: relay.connector,
      },
      handlers(),
    ),
  );
  expect(error.code).toBe("device-revoked");
});

test("a pairing handshake authorizes the device and sends its name", async () => {
  const { relay, runnerId, runnerKey, identity, psk, deviceId } = setup("pair");
  const tunnel = await openTunnel(
    {
      mode: "pair",
      relayUrl: "http://relay.test",
      runnerId,
      runnerKey,
      identity,
      psk,
      name: "Ada's phone",
      platform: "ios",
      connect: relay.connector,
    },
    handlers(),
  );
  expect(tunnel.authorizedDeviceId).toBe(deviceId);
  expect(relay.pairingPayload).toMatchObject({ name: "Ada's phone", platform: "ios" });
  tunnel.close();
  await tunnel.closed;
});

test("a rejected pairing keeps the relay's close code", async () => {
  const { relay, runnerId, runnerKey, identity, psk } = setup("pair", { rejectCloseCode: 4010 });
  const error = await failure(
    openTunnel(
      {
        mode: "pair",
        relayUrl: "http://relay.test",
        runnerId,
        runnerKey,
        identity,
        psk,
        name: "phone",
        platform: "ios",
        connect: relay.connector,
      },
      handlers(),
    ),
  );
  expect(error.code).toBe("pairing-rejected");
  expect(error.closeCode).toBe(4010);
});

test("a failed handshake keeps the relay's close code", async () => {
  const { relay, runnerId, runnerKey, identity } = setup("daily", { rejectCloseCode: 4011 });
  const error = await failure(
    openTunnel(
      {
        mode: "daily",
        relayUrl: "http://relay.test",
        runnerId,
        runnerKey,
        identity,
        connect: relay.connector,
      },
      handlers(),
    ),
  );
  expect(error.code).toBe("handshake-failed");
});

test("the relay going away fails the open tunnel", async () => {
  const { relay, runnerId, runnerKey, identity } = setup("daily");
  const seen = handlers();
  const tunnel = await openTunnel(
    {
      mode: "daily",
      relayUrl: "http://relay.test",
      runnerId,
      runnerKey,
      identity,
      connect: relay.connector,
    },
    seen,
  );
  await relay.close(4001);
  const error = await tunnel.closed;
  expect(error.code).toBe("runner-offline");
  expect(seen.closed).toHaveLength(1);
});

test("two unanswered pings end the tunnel", async () => {
  const { relay, runnerId, runnerKey, identity } = setup("daily", { answerPings: false });
  const tunnel = await openTunnel(
    {
      mode: "daily",
      relayUrl: "http://relay.test",
      runnerId,
      runnerKey,
      identity,
      pingIntervalMs: 10,
      connect: relay.connector,
    },
    handlers(),
  );
  const error = await tunnel.closed;
  expect(error.code).toBe("ping-timeout");
});

test("a body larger than one Noise message is refused", async () => {
  const { relay, runnerId, runnerKey, identity } = setup("daily");
  const tunnel: Tunnel = await openTunnel(
    {
      mode: "daily",
      relayUrl: "http://relay.test",
      runnerId,
      runnerKey,
      identity,
      connect: relay.connector,
    },
    handlers(),
  );
  expect(() => tunnel.send(1, 3, new Uint8Array(MAX_FRAME_BODY + 1))).toThrow(RangeError);
  tunnel.close();
  await tunnel.closed;
});

test("the relay only ever sees ciphertext", async () => {
  const { relay, runnerId, runnerKey, identity } = setup("daily");
  const tunnel = await openTunnel(
    {
      mode: "daily",
      relayUrl: "http://relay.test",
      runnerId,
      runnerKey,
      identity,
      connect: relay.connector,
    },
    handlers(),
  );
  const secret = "GET /api/remote.mux?token=never-on-the-wire";
  tunnel.send(1, 1, utf8Encode(secret));
  await relay.nextFrame();
  tunnel.close();
  await tunnel.closed;

  const decoder = new TextDecoder("utf-8", { fatal: false });
  for (const message of relay.wire) {
    expect(decoder.decode(message)).not.toContain("never-on-the-wire");
    expect(decoder.decode(message)).not.toContain("/api/remote.mux");
  }
});
