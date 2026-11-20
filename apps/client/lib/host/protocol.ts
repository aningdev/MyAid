/** Decode HostControl JSON status payloads (public status never carries URL/token). */
import { t } from "../i18n";

export type HostStatus = {
  phase: string;
  generation?: string | null;
  pid?: number | null;
  /** The dsh version this Host requires (`supported-dsh.json`). */
  version: string;
  /** The Host's own release version. */
  hostVersion?: string;
  /** The dsh version the Host's guardian actually found. */
  dshVersion?: string | null;
  reason?: string | null;
  blocked: boolean;
  url?: string | null;
};

/** Client-side view of Host: wire status plus connection reachability (not a Host phase). */
export type HostView = {
  status: HostStatus | null;
  connection: "up" | "down";
  reason?: string;
};

const PHASES = new Set([
  "stopped",
  "preparing",
  "starting",
  "ready",
  "stopping",
  "failed",
  "recovering",
]);

/** Align with Host `parse_ready_url` — http + 127.0.0.1 + port + non-empty token. */
export function parseReadyUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(t("host.protocol.invalidUrl"));
  }
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !url.searchParams.get("token")
  ) {
    throw new Error(t("host.protocol.invalidUrl"));
  }
  return url;
}

export function assertPublicStatus(status: HostStatus): void {
  if (!PHASES.has(status.phase) || !status.version || status.url) {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  if (status.phase === "ready" && (!status.generation || !status.pid || status.blocked)) {
    throw new Error(t("host.protocol.invalidStatus"));
  }
}

export function assertConnectionInfo(status: HostStatus): void {
  if (
    status.phase !== "ready" ||
    !status.url ||
    !status.generation ||
    !status.pid ||
    status.blocked
  ) {
    throw new Error(status.reason || t("host.protocol.notReady"));
  }
  parseReadyUrl(status.url);
}

export function decodeHostStatus(raw: string): HostStatus {
  const status = JSON.parse(raw) as HostStatus;
  assertPublicStatus(status);
  return status;
}

export function decodeBackendInfo(raw: string): HostStatus {
  const status = JSON.parse(raw) as HostStatus;
  assertConnectionInfo(status);
  return status;
}

/** One paired Device, as `GET /bridge/devices` and `bridge.devices` name it. */
export type PairedDevice = {
  deviceId: string;
  name: string;
  platform: string;
  /** Unix seconds. */
  pairedAt: number;
  /** Unix seconds; `0` when the Device has never connected. */
  lastSeenAt: number;
  online: boolean;
};

/** The Relay link beside the paired list. `reason` is the Host's own sentence. */
export type RelayStatus = {
  configured: boolean;
  connected: boolean;
  runnerId?: string | null;
  reason?: string | null;
};

/** `GET /bridge/devices` and a successful revoke. */
export type DevicesSnapshot = {
  devices: PairedDevice[];
  relay: RelayStatus;
};

/** `POST /bridge/pairing`. The link is a secret: it stays on the pairing screen. */
export type PairingLink = {
  link: string;
  /** Unix seconds. */
  expiresAt: number;
};

/** One `/watch` text frame. An unknown `event` is ignored; it is not a status. */
export type WatchFrame =
  | { kind: "status"; status: HostStatus }
  | { kind: "devices"; devices: PairedDevice[] }
  | { kind: "ignored"; event: string };

function objectOf(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  if (!parsed || typeof parsed !== "object") throw new Error(t("host.protocol.invalidStatus"));
  return parsed as Record<string, unknown>;
}

function decodeDevice(value: unknown): PairedDevice {
  if (!value || typeof value !== "object") throw new Error(t("host.protocol.invalidStatus"));
  const row = value as Record<string, unknown>;
  if (typeof row.deviceId !== "string" || !row.deviceId) {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  if (typeof row.name !== "string" || typeof row.platform !== "string") {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  if (
    typeof row.pairedAt !== "number" ||
    typeof row.lastSeenAt !== "number" ||
    typeof row.online !== "boolean"
  ) {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  return {
    deviceId: row.deviceId,
    name: row.name,
    platform: row.platform,
    pairedAt: row.pairedAt,
    lastSeenAt: row.lastSeenAt,
    online: row.online,
  };
}

export function decodeDeviceList(value: unknown): PairedDevice[] {
  if (!Array.isArray(value)) throw new Error(t("host.protocol.invalidStatus"));
  return value.map(decodeDevice);
}

export function decodeRelayStatus(value: unknown): RelayStatus {
  if (!value || typeof value !== "object") throw new Error(t("host.protocol.invalidStatus"));
  const row = value as Record<string, unknown>;
  if (typeof row.configured !== "boolean" || typeof row.connected !== "boolean") {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  const runnerId = row.runnerId;
  const reason = row.reason;
  if (runnerId !== undefined && runnerId !== null && typeof runnerId !== "string") {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  return {
    configured: row.configured,
    connected: row.connected,
    runnerId: typeof runnerId === "string" ? runnerId : null,
    reason: typeof reason === "string" ? reason : null,
  };
}

export function decodeDevicesSnapshot(raw: string): DevicesSnapshot {
  const body = objectOf(raw);
  return {
    devices: decodeDeviceList(body.devices),
    relay: decodeRelayStatus(body.relay),
  };
}

export function decodePairingLink(raw: string): PairingLink {
  const body = objectOf(raw);
  if (typeof body.link !== "string" || !body.link || typeof body.expiresAt !== "number") {
    throw new Error(t("host.protocol.invalidStatus"));
  }
  return { link: body.link, expiresAt: body.expiresAt };
}

/**
 * Split a `/watch` text frame. Status frames stay `decodeHostStatus`. A frame
 * with `event` is never a status: `bridge.devices` carries the paired list,
 * and any other event is ignored. A devices frame that cannot be read is
 * ignored too, so it cannot look like the Host dropping the socket.
 */
export function decodeWatchFrame(raw: string): WatchFrame {
  const body = objectOf(raw);
  if ("event" in body) {
    const event = body.event;
    if (typeof event !== "string" || !event) return { kind: "ignored", event: "" };
    if (event !== "bridge.devices") return { kind: "ignored", event };
    try {
      return { kind: "devices", devices: decodeDeviceList(body.devices) };
    } catch {
      return { kind: "ignored", event };
    }
  }
  return { kind: "status", status: decodeHostStatus(raw) };
}
