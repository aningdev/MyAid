// The official `Connection` over a Device's Relay Carrier: installation,
// readiness and one unary dsh call all ride the tunnel to the fake dsh behind
// the fake Bridge. No Host, no loopback, no Cookie.

import { expect, test } from "nsh/test";

import { publicId, randomBytes } from "../carrier/relay/bytes";
import { createRelayCarrier, type RelayCarrier } from "../carrier/relay/carrier";
import { generateKeyPair } from "../carrier/relay/noise";
import type { Pairing } from "../carrier/relay/pairing";
import { FakeBridge } from "../carrier/relay/test-support/fake-bridge";
import { fakeDsh } from "../carrier/relay/test-support/fake-dsh";
import { memoryDeviceStore } from "../carrier/relay/test-support/memory-store";
import { Connection } from "./connection";

function setup(): { bridge: FakeBridge; carrier: RelayCarrier } {
  const runner = generateKeyPair();
  const identity = generateKeyPair();
  const pairing: Pairing = {
    relayUrl: "http://relay.test",
    runnerId: publicId(randomBytes(32)),
    runnerKey: runner.publicKey,
    deviceId: publicId(identity.publicKey),
  };
  const dsh = fakeDsh();
  const bridge = new FakeBridge({
    mode: "daily",
    runner,
    runnerId: pairing.runnerId,
    identity,
    respondHttp: (request) => dsh.respondHttp(request),
    respondText: (socket, text) => dsh.respondText(socket, text),
  });
  const carrier = createRelayCarrier({
    pairing,
    identity,
    store: memoryDeviceStore(),
    connect: bridge.connector,
    pingIntervalMs: 10_000,
  });
  return { bridge, carrier };
}

test("a Connection completes a dsh call through the relay carrier", async () => {
  const { bridge, carrier } = setup();
  const connection = new Connection();

  await connection.connectThrough(carrier);
  expect(connection.ready).toBe(true);

  const presets = await connection.listAgentPresets();
  expect(presets).toEqual([{ id: "default", name: "Default", isDefault: true }]);
  expect(bridge.requests.map((request) => request.path)).toContain("/api/agentPresets/list");
  expect(bridge.sockets.size).toBe(1);

  await connection.dispose();
  carrier.close();
}, 20000);
