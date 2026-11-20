// The Device's key and pairing in Storage: the Client's own store over a Map
// standing in for NSH Storage. (The paired Devices of the other cases use the
// same store.)

import {
  clearPairing,
  loadDeviceIdentity,
  loadPairing,
  savePairing,
  storageDeviceStore,
  type Pairing,
} from "@dsh-bot/client/relay";
import { expect, test } from "vitest";

import { memoryStorage } from "../support/device";

const pairing: Pairing = {
  relayUrl: "http://127.0.0.1:1",
  runnerId: "a".repeat(32),
  runnerKey: new Uint8Array(32).fill(7),
  deviceId: "b".repeat(32),
};

test("the key is generated once, kept under its key and read back as the same Device", async () => {
  const storage = memoryStorage();
  const first = await loadDeviceIdentity(storageDeviceStore(storage));
  const second = await loadDeviceIdentity(storageDeviceStore(storage));

  expect(second.id).toBe(first.id);
  expect(second.privateKey).toEqual(first.privateKey);
  expect([...storage.values.keys()]).toEqual(["dsh-bot.device.identity"]);
  expect(Object.keys(JSON.parse(storage.values.get("dsh-bot.device.identity")!))).toEqual([
    "privateKey",
  ]);
});

test("the pairing is stored under its key, read back and cleared", async () => {
  const storage = memoryStorage();
  const store = storageDeviceStore(storage);
  expect(await loadPairing(store)).toBeNull();

  await savePairing(pairing, store);
  expect(await loadPairing(store)).toEqual(pairing);
  expect([...storage.values.keys()]).toEqual(["dsh-bot.device.pairing"]);

  await clearPairing(store);
  expect(await loadPairing(store)).toBeNull();
  expect(storage.values.size).toBe(0);
  await clearPairing(store);
});

test("a damaged record is reported, never replaced", async () => {
  const storage = memoryStorage();
  storage.values.set("dsh-bot.device.identity", "{");
  storage.values.set("dsh-bot.device.pairing", JSON.stringify({ relayUrl: "x" }));
  const store = storageDeviceStore(storage);

  await expect(loadDeviceIdentity(store)).rejects.toMatchObject({ code: "invalid-identity" });
  await expect(loadPairing(store)).rejects.toMatchObject({ code: "invalid-pairing" });
  expect(storage.values.get("dsh-bot.device.identity")).toBe("{");
});
