// The Device's key and pairing as files in a real data root: the Client's own
// file store over a temporary directory. (The nsh tests have no filesystem; the
// paired Devices of the other cases use the same store.)

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  clearPairing,
  fileDeviceStore,
  loadDeviceIdentity,
  loadPairing,
  savePairing,
  type Pairing,
} from "@dsh-bot/client/relay";
import { afterEach, beforeEach, expect, test } from "vitest";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "dsh-bot-e2e-device-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const pairing: Pairing = {
  relayUrl: "http://127.0.0.1:1",
  runnerId: "a".repeat(32),
  runnerKey: new Uint8Array(32).fill(7),
  deviceId: "b".repeat(32),
};

test("the key is generated once, kept in device/identity.json and read back as the same Device", async () => {
  const first = await loadDeviceIdentity(fileDeviceStore(root));
  const second = await loadDeviceIdentity(fileDeviceStore(root));

  expect(second.id).toBe(first.id);
  expect(second.privateKey).toEqual(first.privateKey);
  expect(await readdir(join(root, "device"))).toEqual(["identity.json"]);
  expect(
    Object.keys(JSON.parse(await readFile(join(root, "device", "identity.json"), "utf8"))),
  ).toEqual(["privateKey"]);
});

test("the pairing is stored in device/pairing.json, read back and cleared", async () => {
  const store = fileDeviceStore(root);
  expect(await loadPairing(store)).toBeNull();

  await savePairing(pairing, store);
  expect(await loadPairing(store)).toEqual(pairing);
  expect(await readdir(join(root, "device"))).toEqual(["pairing.json"]);

  await clearPairing(store);
  expect(await loadPairing(store)).toBeNull();
  expect(await readdir(join(root, "device"))).toEqual([]);
  await clearPairing(store);
});

test("a damaged file is reported, never replaced", async () => {
  await mkdir(join(root, "device"));
  await writeFile(join(root, "device", "identity.json"), "{");
  await writeFile(join(root, "device", "pairing.json"), JSON.stringify({ relayUrl: "x" }));
  const store = fileDeviceStore(root);

  await expect(loadDeviceIdentity(store)).rejects.toMatchObject({ code: "invalid-identity" });
  await expect(loadPairing(store)).rejects.toMatchObject({ code: "invalid-pairing" });
  expect(await readFile(join(root, "device", "identity.json"), "utf8")).toBe("{");
});

test("a write leaves the finished record and no temporary file", async () => {
  const store = fileDeviceStore(root);
  await store.write("pairing", "one");
  await store.write("pairing", "two");

  expect(await readdir(join(root, "device"))).toEqual(["pairing.json"]);
  expect(await readFile(join(root, "device", "pairing.json"), "utf8")).toBe("two");
});
