/**
 * The Device side of a pairing: the one pairing record this Client holds, the
 * Carrier that record produces, and what the Pairing entry shows. The record
 * itself belongs to `lib/carrier/relay/pairing.ts`; this module keeps the
 * in-memory view the UI reads and owns no copy of the link or the psk.
 */
import { computed, platform, signal } from "nsh";

import {
  connectSession,
  disposeRuntime,
  useHostControl,
} from "../../features/dialogue/session/runtime";
import { createRelayCarrier, type RelayCarrier } from "../../lib/carrier/relay/carrier";
import { RelayError, type RelayErrorCode } from "../../lib/carrier/relay/errors";
import {
  clearPairing,
  loadDeviceIdentity,
  loadPairing,
  pairDevice,
  type Pairing,
} from "../../lib/carrier/relay/pairing";
import type { TunnelConnector } from "../../lib/carrier/relay/tunnel";
import { useCarrier } from "../../lib/dsh/session";
import { t } from "../../lib/i18n";

/** What the Pairing entry shows instead of the Shell. */
export type DevicePhase = "starting" | "unpaired" | "pairing" | "paired";

/** `removed` is the answer to a revocation, kept until the Device pairs again. */
export type DeviceNotice = "removed";

/** The tunnel's websocket, only replaced by a test that fakes the Relay. */
export interface DeviceOptions {
  connect?: TunnelConnector;
}

export const devicePhase = signal<DevicePhase>("starting");
export const pairingError = signal<RelayErrorCode | null>(null);
export const deviceNotice = signal<DeviceNotice | null>(null);

/** The name field's text; an empty field takes the platform's name. */
const nameDraft = signal("");
export const deviceNameDraft = nameDraft;
export const deviceName = computed(() => nameDraft().trim() || platformName());

/** The platform's own name, which the pairing hands to the Runner. */
export function platformName(): string {
  switch (platform.os) {
    case "ios":
      return "iOS";
    case "android":
      return "Android";
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    case "linux":
      return "Linux";
    case "web":
      return "Web";
    default:
      return t("pairing.platformUnknown");
  }
}

export function setDeviceName(value: string): void {
  nameDraft.set(value);
}

let carrier: RelayCarrier | undefined;

/** Loads the stored pairing, if any, and connects the Client through it. */
export async function startDevice(options: DeviceOptions = {}): Promise<void> {
  try {
    const pairing = await loadPairing();
    if (pairing === null) {
      devicePhase.set("unpaired");
      return;
    }
    await attach(pairing, options);
  } catch (error) {
    // A record that no longer parses is worth no pairing attempt: the next
    // link replaces it.
    await clearPairing().catch(() => undefined);
    pairingError.set(error instanceof RelayError ? error.code : null);
    devicePhase.set("unpaired");
  }
}

/**
 * Claims a pairing link. Only the record `pairDevice` stores survives; the
 * link's text and psk stay in this call.
 */
export async function pairWithLink(link: string, options: DeviceOptions = {}): Promise<void> {
  if (devicePhase() === "pairing") return;
  const trimmed = link.trim();
  if (trimmed === "") return;
  pairingError.set(null);
  deviceNotice.set(null);
  devicePhase.set("pairing");
  try {
    const { pairing, tunnel } = await pairDevice(trimmed, {
      name: deviceName(),
      platform: platformName(),
      connect: options.connect,
    });
    // The pairing tunnel outlives the handshake no further: the Carrier opens
    // the daily tunnel the record now allows.
    tunnel.close();
    await attach(pairing, options);
  } catch (error) {
    pairingError.set(error instanceof RelayError ? error.code : null);
    devicePhase.set("unpaired");
  }
}

/** Forgets this Device's pairing; the Runner keeps its own record until revoked. */
export async function disconnectDevice(): Promise<void> {
  await clearPairing().catch(() => undefined);
  deviceNotice.set(null);
  forget();
}

export function clearPairingError(): void {
  pairingError.set(null);
}

export function clearDeviceNotice(): void {
  deviceNotice.set(null);
}

async function attach(pairing: Pairing, options: DeviceOptions): Promise<void> {
  const identity = await loadDeviceIdentity();
  const next = createRelayCarrier({
    pairing,
    identity,
    connect: options.connect,
    onRevoked: () => {
      deviceNotice.set("removed");
      forget();
    },
  });
  carrier = next;
  useCarrier(next);
  // A Device has no Host to ask: the official Connection owns its retries.
  useHostControl(false);
  devicePhase.set("paired");
  void connectSession();
}

/** Drops the Carrier and everything it carried, back to the Pairing entry. */
function forget(): void {
  carrier?.close();
  carrier = undefined;
  useCarrier(undefined);
  useHostControl(true);
  devicePhase.set("unpaired");
  void disposeRuntime();
}
