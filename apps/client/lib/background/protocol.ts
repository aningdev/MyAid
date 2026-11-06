/** Shared Background Service registration contract (mirrors myaid-background-service). */

export const REGISTRATION_CONTRACT_VERSION = 1;

export type ServiceUnit = "host" | "relay";

export type RegistrationPhase =
  | "notRegistered"
  | "pendingApproval"
  | "registered"
  | "denied"
  | "failed";

export type BackgroundAvailability = "off" | "degraded" | "full";

export type UnitRegistration = {
  unit: ServiceUnit;
  phase: RegistrationPhase;
  reason?: string | null;
};

export type RegistrationSnapshot = {
  version: number;
  host: UnitRegistration;
  relay: UnitRegistration;
  availability: BackgroundAvailability;
};

export type ProductBackgroundRegistration = {
  version: number;
  host: UnitRegistration;
  relay: UnitRegistration;
  availability: BackgroundAvailability;
};

const PHASES = new Set<RegistrationPhase>([
  "notRegistered",
  "pendingApproval",
  "registered",
  "denied",
  "failed",
]);

const UNITS = new Set<ServiceUnit>(["host", "relay"]);

export function isRegisteredWithOs(phase: RegistrationPhase): boolean {
  return phase === "registered";
}

export function backgroundAvailability(
  host: RegistrationPhase,
  relay: RegistrationPhase,
): BackgroundAvailability {
  const h = isRegisteredWithOs(host);
  const r = isRegisteredWithOs(relay);
  if (h && r) return "full";
  if (!h && !r) return "off";
  return "degraded";
}

export function mergeProductRegistration(
  fromHost: RegistrationSnapshot,
  fromRelay: RegistrationSnapshot,
): ProductBackgroundRegistration {
  const host = fromHost.host;
  const relay = fromRelay.relay;
  return {
    version: REGISTRATION_CONTRACT_VERSION,
    host,
    relay,
    availability: backgroundAvailability(host.phase, relay.phase),
  };
}

function assertUnitRegistration(value: UnitRegistration): void {
  if (!UNITS.has(value.unit) || !PHASES.has(value.phase)) {
    throw new Error("Invalid unit registration");
  }
}

export function decodeUnitRegistration(raw: string): UnitRegistration {
  const value = JSON.parse(raw) as UnitRegistration;
  assertUnitRegistration(value);
  return value;
}

export function decodeRegistrationSnapshot(raw: string): RegistrationSnapshot {
  const value = JSON.parse(raw) as RegistrationSnapshot;
  assertUnitRegistration(value.host);
  assertUnitRegistration(value.relay);
  if (typeof value.version !== "number") {
    throw new Error("Invalid registration snapshot");
  }
  return value;
}

/** Desktop targets may orchestrate OS Background Services; mobile does not run them. */
export function backgroundServicesRunnable(target: string): boolean {
  return target === "macos" || target === "windows" || target === "linux";
}
