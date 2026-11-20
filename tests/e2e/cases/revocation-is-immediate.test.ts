// Spec acceptance 9: when the Runner removes a Device, its live stream hears
// `revoked` at once, its pairing record is gone, and a later handshake with
// the old identity is answered `device-revoked`.

import { loadDeviceIdentity, loadPairing, openTunnel } from "@dsh-bot/client/relay";
import { afterAll, beforeAll, expect, test } from "vitest";

import { type Device, pairedDevice } from "../support/device";
import { type Stack, startStack, until } from "../support/harness";

interface Listed {
  devices: { deviceId: string; online: boolean }[];
}

let stack: Stack;
let device: Device;

beforeAll(async () => {
  stack = await startStack({ httpReply: "ok", muxReply: "ok" });
  device = await pairedDevice(stack, "e2e-tablet");
});

afterAll(async () => {
  device?.carrier.close();
  await stack?.stop();
});

async function listed(): Promise<Listed["devices"]> {
  return ((await (await stack.host("/bridge/devices")).json()) as Listed).devices;
}

test("revoking a Device ends its live stream and shuts it out", async () => {
  // A live stream: the mux is open, so the Device is online.
  const mux = device.carrier.createWebSocket(device.url("api/remote.mux"));
  const failed = new Promise<void>((resolve) => mux.addEventListener("error", () => resolve()));
  await new Promise<void>((resolve, reject) => {
    mux.addEventListener("open", () => resolve());
    mux.addEventListener("error", () => reject(new Error("mux did not open")));
  });
  const before = await listed();
  expect(before.map((entry) => entry.deviceId)).toEqual([device.deviceId]);
  expect(before[0]?.online).toBe(true);
  const identity = await loadDeviceIdentity(device.store);
  const pairing = await loadPairing(device.store);
  expect(pairing).not.toBeNull();

  const removed = await stack.host(`/bridge/devices/${device.deviceId}`, { method: "DELETE" });
  expect(removed.status).toBe(200);

  // The live stream got `revoked`: the socket failed, the callback fired and
  // the pairing record is gone.
  await failed;
  await until("onRevoked", async () => device.revoked.count > 0);
  expect(device.revoked.count).toBe(1);
  expect(await loadPairing(device.store)).toBeNull();
  expect(await listed()).toEqual([]);

  // The old identity shakes hands again and is told it was revoked.
  await expect(
    openTunnel(
      {
        mode: "daily",
        relayUrl: pairing!.relayUrl,
        runnerId: pairing!.runnerId,
        runnerKey: pairing!.runnerKey,
        identity,
      },
      { onFrame: () => undefined, onClose: () => undefined },
    ),
  ).rejects.toMatchObject({ code: "device-revoked" });
});
