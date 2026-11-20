import { expect, test } from "nsh/test";

import { b64urlEncode, publicId } from "./bytes";
import { relayError } from "./errors";
import { generateKeyPair } from "./noise";
import {
  clearPairing,
  DEVICE_IDENTITY_KEY,
  loadDeviceIdentity,
  loadPairing,
  PAIRING_KEY,
  parsePairingLink,
  savePairing,
  type StorageLike,
} from "./pairing";

const now = 1_700_000_000;

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

function pairingLink(options: { version?: string; expiresAt?: number; runnerId?: string } = {}): {
  link: string;
  runnerKey: Uint8Array;
  psk: Uint8Array;
} {
  const runner = generateKeyPair();
  const psk = generateKeyPair().privateKey;
  const runnerId = options.runnerId ?? publicId(runner.publicKey);
  const params = [
    `v=${options.version ?? "1"}`,
    `r=${runnerId}`,
    `k=${b64urlEncode(runner.publicKey)}`,
    `p=${b64urlEncode(psk)}`,
    `e=${options.expiresAt ?? now + 60}`,
  ];
  return { link: `https://relay.example.com/pair#${params.join("&")}`, runnerKey: runner.publicKey, psk };
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code ?? "no-code";
  }
  return "no-error";
}

test("a pairing link yields the relay, runner and psk", () => {
  const { link, runnerKey, psk } = pairingLink();
  const invite = parsePairingLink(link, now);
  expect(invite.relayUrl).toBe("https://relay.example.com");
  expect(invite.runnerId).toBe(publicId(runnerKey));
  expect(invite.runnerKey).toEqual(runnerKey);
  expect(invite.psk).toEqual(psk);
  expect(invite.expiresAt).toBe(now + 60);
});

test("a link keeps a non-default relay port", () => {
  const { link } = pairingLink();
  const invite = parsePairingLink(link.replace("relay.example.com", "relay.example.com:8443"), now);
  expect(invite.relayUrl).toBe("https://relay.example.com:8443");
});

test("a malformed pairing link is invalid", () => {
  const cases = [
    "not a url",
    "ftp://relay.example.com/pair#v=1",
    "https://relay.example.com/other#v=1",
    pairingLink({ version: "2" }).link,
    pairingLink().link.replace("v=1", "v=1&v=1"),
    pairingLink().link.replace(/k=[^&]+/, "k=AAAA"),
    pairingLink({ runnerId: "a".repeat(32) }).link,
  ];
  for (const link of cases) {
    expect(codeOf(() => parsePairingLink(link, now))).toBe("invalid-link");
  }
});

test("an expired pairing link says so", () => {
  const { link } = pairingLink({ expiresAt: now });
  expect(codeOf(() => parsePairingLink(link, now))).toBe("expired-link");
});

test("the device key is created once and kept", async () => {
  const storage = new FakeStorage();
  const first = await loadDeviceIdentity(storage);
  const second = await loadDeviceIdentity(storage);

  expect(first.id).toMatch(/^[a-z2-7]{32}$/);
  expect(second.id).toBe(first.id);
  expect(second.privateKey).toEqual(first.privateKey);
  expect(storage.values.has(DEVICE_IDENTITY_KEY)).toBe(true);
});

test("a damaged device key is reported, not replaced", async () => {
  const storage = new FakeStorage();
  storage.values.set(DEVICE_IDENTITY_KEY, "{");
  await expect(loadDeviceIdentity(storage)).rejects.toMatchObject({ code: "invalid-identity" });

  storage.values.set(DEVICE_IDENTITY_KEY, JSON.stringify({ privateKey: "AAAA" }));
  await expect(loadDeviceIdentity(storage)).rejects.toMatchObject({ code: "invalid-identity" });
});

test("a pairing round-trips through storage and can be cleared", async () => {
  const storage = new FakeStorage();
  const identity = await loadDeviceIdentity(storage);
  const { runnerKey } = pairingLink();
  const pairing = {
    relayUrl: "https://relay.example.com",
    runnerId: publicId(runnerKey),
    runnerKey,
    deviceId: identity.id,
  };

  await savePairing(pairing, storage);
  expect(storage.values.has(PAIRING_KEY)).toBe(true);
  expect(await loadPairing(storage)).toEqual(pairing);

  await clearPairing(storage);
  expect(await loadPairing(storage)).toBeNull();
});

test("a damaged pairing is reported", async () => {
  const storage = new FakeStorage();
  storage.values.set(PAIRING_KEY, JSON.stringify({ relayUrl: "https://relay.example.com" }));
  await expect(loadPairing(storage)).rejects.toMatchObject({ code: "invalid-pairing" });
});

test("the errors carry their messages", () => {
  expect(relayError("expired-link").message).toBe("The pairing link has expired.");
});
