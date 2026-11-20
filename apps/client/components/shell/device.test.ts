/**
 * The Device's pairing flow over faked Runners: the entry a Client without a
 * pairing shows, every link error it can answer with, a successful pairing
 * that reaches dsh through the Carrier, and the way back after a revoke.
 */
import { Storage } from "nsh";
import { expect, test } from "nsh/test";

import { disposeRuntime } from "../../features/dialogue/session/runtime";
import { b64urlEncode, publicId, randomBytes } from "../../lib/carrier/relay/bytes";
import { storageDeviceStore } from "../../lib/carrier/relay/device-store";
import { generateKeyPair, type KeyPair } from "../../lib/carrier/relay/noise";
import {
  clearPairing,
  loadDeviceIdentity,
  loadPairing,
  savePairing,
  type Pairing,
} from "../../lib/carrier/relay/pairing";
import { FakeBridge } from "../../lib/carrier/relay/test-support/fake-bridge";
import { fakeDsh } from "../../lib/carrier/relay/test-support/fake-dsh";
import type { TunnelConnector } from "../../lib/carrier/relay/tunnel";
import {
  deviceNotice,
  devicePhase,
  disconnectDevice,
  pairingError,
  pairWithLink,
  startDevice,
} from "./device";

const store = storageDeviceStore(Storage);

interface Runner {
  runner: KeyPair;
  runnerId: string;
  psk: Uint8Array;
}

function runner(): Runner {
  const keys = generateKeyPair();
  return {
    runner: keys,
    runnerId: publicId(randomBytes(32)),
    psk: generateKeyPair().privateKey,
  };
}

function linkOf(fixture: Runner, expiresAt = Math.floor(Date.now() / 1000) + 300): string {
  const params = [
    "v=1",
    `r=${fixture.runnerId}`,
    `k=${b64urlEncode(fixture.runner.publicKey)}`,
    `p=${b64urlEncode(fixture.psk)}`,
    `e=${expiresAt}`,
  ];
  return `https://relay.example.com/pair#${params.join("&")}`;
}

/** A Runner that answers the pairing handshake, then every daily tunnel. */
async function runnerForPairing(
  fixture: Runner,
  options: { rejectCloseCode?: number } = {},
): Promise<{ daily: FakeBridge; connector: TunnelConnector }> {
  const identity = await loadDeviceIdentity(store);
  const dsh = fakeDsh();
  const pairable = new FakeBridge({
    mode: "pair",
    runner: fixture.runner,
    runnerId: fixture.runnerId,
    identity,
    psk: fixture.psk,
    rejectCloseCode: options.rejectCloseCode,
  });
  const daily = new FakeBridge({
    mode: "daily",
    runner: fixture.runner,
    runnerId: fixture.runnerId,
    identity,
    respondHttp: (request) => dsh.respondHttp(request),
    respondText: (socket, text) => dsh.respondText(socket, text),
  });
  let dials = 0;
  const connector: TunnelConnector = (url) =>
    dials++ === 0 ? pairable.connector(url) : daily.connector(url);
  return { daily, connector };
}

async function until(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > end) throw new Error("the Device did not reach the expected state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function reset(): Promise<void> {
  await disconnectDevice({ store });
  await disposeRuntime();
  await clearPairing(store).catch(() => undefined);
}

test("a Client without a pairing record shows the pairing entry", async () => {
  await reset();
  await startDevice({ store });
  expect(devicePhase()).toBe("unpaired");
  expect(pairingError()).toBeNull();
});

test("an invalid link keeps the pairing entry and says why", async () => {
  await reset();
  await startDevice({ store });
  await pairWithLink("not a pairing link", { store });
  expect(devicePhase()).toBe("unpaired");
  expect(pairingError()).toBe("invalid-link");
});

test("an expired link says so", async () => {
  await reset();
  await startDevice({ store });
  await pairWithLink(linkOf(runner(), Math.floor(Date.now() / 1000) - 1), { store });
  expect(devicePhase()).toBe("unpaired");
  expect(pairingError()).toBe("expired-link");
});

test("pasting a valid link pairs and reaches dsh through the Carrier", async () => {
  await reset();
  await startDevice({ store });
  const fixture = runner();
  const runners = await runnerForPairing(fixture);

  await pairWithLink(linkOf(fixture), { connect: runners.connector, store });

  expect(devicePhase()).toBe("paired");
  expect(pairingError()).toBeNull();
  const record = await loadPairing(store);
  expect(record?.runnerId).toBe(fixture.runnerId);
  // Only the record survives: neither the link nor its psk reaches storage.
  const stored = (await store.read("pairing")) ?? "";
  expect(stored).not.toContain(b64urlEncode(fixture.psk));
  expect(stored).not.toContain("#");

  await until(() => runners.daily.sockets.size > 0);
  expect(runners.daily.sockets.get(1)?.path).toBe("/api/remote.mux");

  await disconnectDevice({ store });
});

test("a rejected link says so and stores nothing", async () => {
  await reset();
  await startDevice({ store });
  const fixture = runner();
  const runners = await runnerForPairing(fixture, { rejectCloseCode: 4010 });

  await pairWithLink(linkOf(fixture), { connect: runners.connector, store });

  expect(devicePhase()).toBe("unpaired");
  expect(pairingError()).toBe("pairing-rejected");
  expect(await loadPairing(store)).toBeNull();
});

test("a revoked device returns to the pairing entry with the notice", async () => {
  await reset();
  const fixture = runner();
  const identity = await loadDeviceIdentity(store);
  const record: Pairing = {
    relayUrl: "https://relay.example.com",
    runnerId: fixture.runnerId,
    runnerKey: fixture.runner.publicKey,
    deviceId: identity.id,
  };
  await savePairing(record, store);
  const dsh = fakeDsh();
  const bridge = new FakeBridge({
    mode: "daily",
    runner: fixture.runner,
    runnerId: fixture.runnerId,
    identity,
    respondHttp: (request) => dsh.respondHttp(request),
    respondText: (socket, text) => dsh.respondText(socket, text),
  });

  await startDevice({ connect: bridge.connector });
  expect(devicePhase()).toBe("paired");
  await until(() => bridge.sockets.size > 0);

  bridge.control("revoked");

  await until(() => devicePhase() === "unpaired");
  expect(deviceNotice()).toBe("removed");
  expect(await loadPairing(store)).toBeNull();
});
