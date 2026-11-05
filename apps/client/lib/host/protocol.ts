/** Decode HostControl JSON status payloads (public status never carries URL/token). */

export type HostStatus = {
  phase: string;
  generation?: string | null;
  pid?: number | null;
  version: string;
  reason?: string | null;
  blocked: boolean;
  url?: string | null;
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

export function decodeHostStatus(raw: string): HostStatus {
  const status = JSON.parse(raw) as HostStatus;
  if (!PHASES.has(status.phase) || !status.version || status.url) {
    throw new Error("Invalid host status");
  }
  if (status.phase === "ready" && (!status.generation || !status.pid || status.blocked)) {
    throw new Error("Invalid ready host status");
  }
  return status;
}

export function decodeBackendInfo(raw: string): HostStatus {
  const status = JSON.parse(raw) as HostStatus;
  if (status.phase !== "ready" || !status.url || !status.generation || !status.pid) {
    throw new Error(status.reason || "Host connection is not ready");
  }
  const url = new URL(status.url);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    !url.searchParams.get("token")
  ) {
    throw new Error("Invalid host connection URL");
  }
  return status;
}
