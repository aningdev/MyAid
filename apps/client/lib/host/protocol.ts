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
    throw new Error("Invalid host connection URL");
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
    throw new Error("Invalid host connection URL");
  }
  return url;
}

export function assertPublicStatus(status: HostStatus): void {
  if (!PHASES.has(status.phase) || !status.version || status.url) {
    throw new Error("Invalid host status");
  }
  if (status.phase === "ready" && (!status.generation || !status.pid || status.blocked)) {
    throw new Error("Invalid ready host status");
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
    throw new Error(status.reason || "Host connection is not ready");
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
