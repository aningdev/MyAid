// Pairing with a Runner: the link the Runner shows, the Device's own static
// key, and the single pairing record kept in nsh Storage. Parsing and record
// validation stay pure so tests and the UI decide when storage is touched.

import { Storage } from "nsh";

import { b64urlDecode, b64urlEncode, publicId } from "./bytes";
import { relayError } from "./errors";
import { generateKeyPair, keyPairFromPrivate, type KeyPair } from "./noise";
import { openTunnel, type Tunnel, type TunnelConnector } from "./tunnel";

/** The part of nsh's storage this module uses; a Map-backed object suffices in tests. */
export interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Where the Device's static X25519 key lives. */
export const DEVICE_IDENTITY_KEY = "dsh-bot.device.identity";
/** Where the one pairing with this Device's Runner lives. */
export const PAIRING_KEY = "dsh-bot.device.pairing";

const PAIRING_VERSION = "1";
const PAIRING_PATH = "/pair";
const ID_PATTERN = /^[a-z2-7]{32}$/;

/** A parsed `<relay>/pair#…` link; `expiresAt` is Unix seconds. */
export interface PairingInvite {
  relayUrl: string;
  runnerId: string;
  runnerKey: Uint8Array;
  psk: Uint8Array;
  expiresAt: number;
}

/** The Device's stable identity; `id` is the public id of `publicKey`. */
export interface DeviceIdentity extends KeyPair {
  id: string;
}

/** The stored pairing: one Runner for this Device. */
export interface Pairing {
  relayUrl: string;
  runnerId: string;
  runnerKey: Uint8Array;
  deviceId: string;
}

/**
 * Parses a pairing link, rejecting anything malformed and links whose `e` has
 * passed. The psk is returned for the IKpsk1 handshake and never stored.
 */
export function parsePairingLink(
  link: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): PairingInvite {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw relayError("invalid-link");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw relayError("invalid-link");
  if (url.pathname !== PAIRING_PATH) throw relayError("invalid-link");

  const params = new URLSearchParams(url.hash.replace(/^#/, ""));
  const single = (name: string): string => {
    const values = params.getAll(name);
    if (values.length !== 1) throw relayError("invalid-link");
    return values[0];
  };

  if (single("v") !== PAIRING_VERSION) throw relayError("invalid-link");

  const runnerId = single("r");
  if (!ID_PATTERN.test(runnerId)) throw relayError("invalid-link");

  let runnerKey: Uint8Array;
  let psk: Uint8Array;
  try {
    runnerKey = b64urlDecode(single("k"));
    psk = b64urlDecode(single("p"));
  } catch {
    throw relayError("invalid-link");
  }
  if (runnerKey.length !== 32 || psk.length !== 32) throw relayError("invalid-link");

  const expires = single("e");
  if (!/^\d{1,10}$/.test(expires)) throw relayError("invalid-link");
  const expiresAt = Number(expires);
  if (expiresAt <= nowSeconds) throw relayError("expired-link");

  return { relayUrl: url.origin, runnerId, runnerKey, psk, expiresAt };
}

/** Loads the Device key, creating and storing one on first use. */
export async function loadDeviceIdentity(storage: StorageLike = Storage): Promise<DeviceIdentity> {
  const stored = await storage.getItem(DEVICE_IDENTITY_KEY);
  if (stored === null) {
    const keyPair = generateKeyPair();
    const identity = identityOf(keyPair);
    await storage.setItem(
      DEVICE_IDENTITY_KEY,
      JSON.stringify({ privateKey: b64urlEncode(keyPair.privateKey) }),
    );
    return identity;
  }
  return identityOf(parseIdentity(stored));
}

function parseIdentity(stored: string): KeyPair {
  let record: unknown;
  try {
    record = JSON.parse(stored);
  } catch {
    throw relayError("invalid-identity");
  }
  if (
    typeof record !== "object" ||
    record === null ||
    typeof (record as { privateKey?: unknown }).privateKey !== "string"
  ) {
    throw relayError("invalid-identity");
  }
  let privateKey: Uint8Array;
  try {
    privateKey = b64urlDecode((record as { privateKey: string }).privateKey);
  } catch {
    throw relayError("invalid-identity");
  }
  if (privateKey.length !== 32) throw relayError("invalid-identity");
  return keyPairFromPrivate(privateKey);
}

function identityOf(keyPair: KeyPair): DeviceIdentity {
  return { ...keyPair, id: publicId(keyPair.publicKey) };
}

/** Stores the pairing, replacing any earlier one. */
export async function savePairing(pairing: Pairing, storage: StorageLike = Storage): Promise<void> {
  await storage.setItem(
    PAIRING_KEY,
    JSON.stringify({
      relayUrl: pairing.relayUrl,
      runnerId: pairing.runnerId,
      runnerKey: b64urlEncode(pairing.runnerKey),
      deviceId: pairing.deviceId,
    }),
  );
}

/** Reads the stored pairing; `null` when this Device has none. */
export async function loadPairing(storage: StorageLike = Storage): Promise<Pairing | null> {
  const stored = await storage.getItem(PAIRING_KEY);
  if (stored === null) return null;

  let record: unknown;
  try {
    record = JSON.parse(stored);
  } catch {
    throw relayError("invalid-pairing");
  }
  if (typeof record !== "object" || record === null) throw relayError("invalid-pairing");
  const { relayUrl, runnerId, runnerKey, deviceId } = record as Record<string, unknown>;
  if (
    typeof relayUrl !== "string" ||
    typeof runnerId !== "string" ||
    typeof runnerKey !== "string"
  ) {
    throw relayError("invalid-pairing");
  }
  if (typeof deviceId !== "string" || !ID_PATTERN.test(runnerId) || !ID_PATTERN.test(deviceId)) {
    throw relayError("invalid-pairing");
  }

  let origin: string;
  let key: Uint8Array;
  try {
    origin = new URL(relayUrl).origin;
    key = b64urlDecode(runnerKey);
  } catch {
    throw relayError("invalid-pairing");
  }
  if (origin !== relayUrl || key.length !== 32) throw relayError("invalid-pairing");

  return { relayUrl, runnerId, runnerKey: key, deviceId };
}

/** Forgets the pairing, as a `device-revoked` or `revoked` answer requires. */
export async function clearPairing(storage: StorageLike = Storage): Promise<void> {
  await storage.removeItem(PAIRING_KEY);
}

/** Options for the one pairing handshake the link authorizes. */
export interface PairDeviceOptions {
  name: string;
  platform: string;
  storage?: StorageLike;
  connect?: TunnelConnector;
  nowSeconds?: number;
}

/** A completed pairing and the tunnel that carried it. */
export interface PairedDevice {
  pairing: Pairing;
  /** The pairing window's tunnel; the pairing itself is already stored. */
  tunnel: Tunnel;
}

/**
 * Claims a pairing link: parses it, loads or creates the Device key, runs the
 * IKpsk1 handshake with the link's one-time psk, then stores the pairing.
 * Every failure leaves the stored pairing untouched.
 */
export async function pairDevice(link: string, options: PairDeviceOptions): Promise<PairedDevice> {
  const invite = parsePairingLink(link, options.nowSeconds);
  const identity = await loadDeviceIdentity(options.storage);
  const tunnel = await openTunnel(
    {
      mode: "pair",
      relayUrl: invite.relayUrl,
      runnerId: invite.runnerId,
      runnerKey: invite.runnerKey,
      identity,
      psk: invite.psk,
      name: options.name,
      platform: options.platform,
      connect: options.connect,
    },
    {
      // The pairing window carries no streams; the Runner closes it after
      // handing over the device id, and the daily tunnel replaces it.
      onFrame: () => undefined,
      onClose: () => undefined,
    },
  );
  const pairing: Pairing = {
    relayUrl: invite.relayUrl,
    runnerId: invite.runnerId,
    runnerKey: invite.runnerKey,
    deviceId: identity.id,
  };
  await savePairing(pairing, options.storage);
  return { pairing, tunnel };
}
