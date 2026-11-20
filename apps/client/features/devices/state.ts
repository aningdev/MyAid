/**
 * Paired Devices and the Relay link, for the Runner's Client. The Host owns
 * the list; this is the only copy the UI reads. A follow reads
 * `GET /bridge/devices`, then applies `/watch` `bridge.devices` frames.
 * Writes apply the body that comes back. The pairing link lives here only
 * while the page is open: it is not stored and not logged.
 *
 * Host down, or a new Host generation, ends the follow. A generation that is
 * still up starts a new follow; a dropped socket stays down until the page
 * follows again.
 */
import { signal } from "nsh";

import { bridgeAccess } from "../../lib/host/control";
import type {
  DevicesSnapshot,
  PairedDevice,
  PairingLink,
  RelayStatus,
} from "../../lib/host/protocol";
import { t } from "../../lib/i18n";

export type DevicesPhase = "idle" | "loading" | "ready" | "down";

export const devicesPhase = signal<DevicesPhase>("idle");
export const pairedDevices = signal<PairedDevice[]>([]);
export const relayStatus = signal<RelayStatus | null>(null);
export const devicesError = signal<string | null>(null);
export const pairingTicket = signal<PairingLink | null>(null);
export const pairingError = signal<string | null>(null);
export const devicesSaving = signal(false);

let epoch = 0;
let stopWatch: (() => void) | undefined;
let seenGeneration: string | null | undefined;

/** Read the list, then follow `/watch`. Replaces any previous follow. */
export async function followDevices(): Promise<void> {
  const mine = ++epoch;
  const previous = stopWatch;
  stopWatch = undefined;
  seenGeneration = undefined;
  previous?.();
  pairingTicket.set(null);
  pairingError.set(null);
  devicesError.set(null);
  if (devicesPhase() !== "ready") devicesPhase.set("loading");
  let sawDevices = false;
  try {
    const snapshot = await bridgeAccess.devices();
    if (mine !== epoch) return;
    applySnapshot(snapshot);
    devicesPhase.set("ready");
  } catch (error) {
    if (mine !== epoch) return;
    devicesPhase.set("down");
    devicesError.set(messageOf(error));
    return;
  }
  try {
    const stop = await bridgeAccess.watch(
      (status) => {
        if (mine !== epoch) return;
        const generation = status.generation ?? null;
        if (seenGeneration === undefined) {
          seenGeneration = generation;
          return;
        }
        if (generation !== seenGeneration) void followDevices();
      },
      (reason) => {
        if (mine !== epoch) return;
        devicesPhase.set("down");
        devicesError.set(reason);
        stopDevices();
      },
      (devices) => {
        if (mine !== epoch) return;
        sawDevices = true;
        pairedDevices.set(devices);
      },
    );
    if (mine !== epoch) {
      stop();
      return;
    }
    stopWatch = stop;
  } catch (error) {
    if (mine !== epoch) return;
    devicesPhase.set("down");
    devicesError.set(messageOf(error));
    return;
  }
  try {
    const again = await bridgeAccess.devices();
    if (mine !== epoch || sawDevices) return;
    applySnapshot(again);
  } catch {
    // The first read already succeeded. A miss here waits for the next frame.
  }
}

/** End the follow. A later frame from the old socket is ignored. */
export function stopDevices(): void {
  epoch += 1;
  const previous = stopWatch;
  stopWatch = undefined;
  seenGeneration = undefined;
  previous?.();
  pairingTicket.set(null);
  devicesSaving.set(false);
}

/** Issue a pairing link. Refused without a configured Relay. */
export async function createPairing(): Promise<boolean> {
  const mine = epoch;
  const relay = relayStatus();
  if (devicesPhase() !== "ready" || devicesSaving() || (relay && !relay.configured)) return false;
  devicesSaving.set(true);
  pairingError.set(null);
  try {
    const ticket = await bridgeAccess.issuePairing();
    if (mine !== epoch) return false;
    pairingTicket.set(ticket);
    return true;
  } catch (error) {
    if (mine !== epoch) return false;
    pairingError.set(messageOf(error));
    return false;
  } finally {
    if (mine === epoch) devicesSaving.set(false);
  }
}

/** Revoke one Device. The list becomes the body the Host returned. */
export async function revokePaired(deviceId: string): Promise<boolean> {
  const mine = epoch;
  if (devicesPhase() !== "ready" || devicesSaving()) return false;
  devicesSaving.set(true);
  devicesError.set(null);
  try {
    const snapshot = await bridgeAccess.revoke(deviceId);
    if (mine !== epoch) return false;
    applySnapshot(snapshot);
    return true;
  } catch (error) {
    if (mine !== epoch) return false;
    devicesError.set(messageOf(error));
    return false;
  } finally {
    if (mine === epoch) devicesSaving.set(false);
  }
}

function applySnapshot(snapshot: DevicesSnapshot): void {
  pairedDevices.set(snapshot.devices);
  relayStatus.set(snapshot.relay);
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : t("common.unknownError");
}
