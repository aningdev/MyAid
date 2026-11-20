/** Host OS registration snapshot. Query, enable and stop all return this shape. */

import { t } from "../i18n";

export const REGISTRATION_CONTRACT_VERSION = 1;

export type RegistrationPhase =
  | "notRegistered"
  | "pendingApproval"
  | "registered"
  | "denied"
  | "failed";

export type RegistrationSnapshot = {
  version: number;
  phase: RegistrationPhase;
  reason?: string | null;
};

function isPhase(value: unknown): value is RegistrationPhase {
  return (
    value === "notRegistered" ||
    value === "pendingApproval" ||
    value === "registered" ||
    value === "denied" ||
    value === "failed"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function decodeRegistrationSnapshot(raw: string): RegistrationSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(t("background.error.invalidSnapshot"));
  }
  if (
    !isRecord(value) ||
    value.version !== REGISTRATION_CONTRACT_VERSION ||
    !isPhase(value.phase)
  ) {
    throw new Error(t("background.error.invalidSnapshot"));
  }
  const reason = value.reason;
  if (reason !== undefined && reason !== null && typeof reason !== "string") {
    throw new Error(t("background.error.invalidSnapshot"));
  }
  return {
    version: REGISTRATION_CONTRACT_VERSION,
    phase: value.phase,
    ...(typeof reason === "string" ? { reason } : {}),
  };
}

/** The settings panel offers OS registration on macOS and Windows. */
export function backgroundServicesRunnable(target: string): boolean {
  return target === "macos" || target === "windows";
}
