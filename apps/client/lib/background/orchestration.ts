import {
  mergeProductRegistration,
  type ProductBackgroundRegistration,
  type RegistrationSnapshot,
  type UnitRegistration,
} from "./protocol";

export type BackgroundRegistrationClient = {
  side: "host" | "relay";
  reachable(): Promise<boolean>;
  registrationQuery(): Promise<RegistrationSnapshot>;
  registrationEnable(): Promise<UnitRegistration>;
  registrationStop(): Promise<UnitRegistration>;
};

export type BackgroundOrchestration = {
  host: BackgroundRegistrationClient;
  relay: BackgroundRegistrationClient;
};

export type ProductBackgroundView = ProductBackgroundRegistration & {
  /** Per-unit enable errors after user enable; empty when query-only. */
  enableErrors?: Partial<Record<"host" | "relay", string>>;
};

let orchestration: BackgroundOrchestration | null = null;

export function setBackgroundOrchestration(next: BackgroundOrchestration | null): void {
  orchestration = next;
}

function deps(): BackgroundOrchestration {
  if (!orchestration) {
    throw new Error("Background orchestration is not configured");
  }
  return orchestration;
}

async function queryBoth(): Promise<ProductBackgroundRegistration> {
  const { host, relay } = deps();
  const [fromHost, fromRelay] = await Promise.all([
    host.registrationQuery(),
    relay.registrationQuery(),
  ]);
  return mergeProductRegistration(fromHost, fromRelay);
}

export async function queryProductBackground(): Promise<ProductBackgroundView> {
  return queryBoth();
}

async function tryRegistrationEnable(
  client: BackgroundRegistrationClient,
): Promise<string | undefined> {
  try {
    await client.registrationEnable();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** User enable: orchestrate Host and Relay registration independently (ADR-0002). */
export async function enableProductBackground(): Promise<ProductBackgroundView> {
  const { host, relay } = deps();
  const [hostError, relayError] = await Promise.all([
    tryRegistrationEnable(host),
    tryRegistrationEnable(relay),
  ]);
  const view = await queryBoth();
  const enableErrors: ProductBackgroundView["enableErrors"] = {};
  if (hostError) enableErrors.host = hostError;
  if (relayError) enableErrors.relay = relayError;
  return Object.keys(enableErrors).length ? { ...view, enableErrors } : view;
}

/** Stop product Background: registration stop on both units only — not Registry or sessions. */
export async function stopProductBackground(): Promise<ProductBackgroundView> {
  const { host, relay } = deps();
  await Promise.all([
    host.registrationStop().catch(() => undefined),
    relay.registrationStop().catch(() => undefined),
  ]);
  return queryBoth();
}
