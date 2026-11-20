import { t } from "../i18n";
import { type RegistrationSnapshot } from "./protocol";

export type BackgroundRegistrationClient = {
  reachable(): Promise<boolean>;
  registrationQuery(): Promise<RegistrationSnapshot>;
  registrationEnable(): Promise<RegistrationSnapshot>;
  registrationStop(): Promise<RegistrationSnapshot>;
};

export type BackgroundOrchestration = {
  host: BackgroundRegistrationClient;
};

export type ProductBackgroundView = RegistrationSnapshot & {
  /** Set when the user's enable failed; absent on a query. */
  enableError?: string;
};

let orchestration: BackgroundOrchestration | null = null;

export function setBackgroundOrchestration(next: BackgroundOrchestration | null): void {
  orchestration = next;
}

function deps(): BackgroundOrchestration {
  if (!orchestration) {
    throw new Error(t("background.error.notConfigured"));
  }
  return orchestration;
}

async function queryHost(): Promise<RegistrationSnapshot> {
  return deps().host.registrationQuery();
}

export async function queryProductBackground(): Promise<ProductBackgroundView> {
  return queryHost();
}

/** User enable: ask the Host to register, and keep the failure beside the snapshot. */
export async function enableProductBackground(): Promise<ProductBackgroundView> {
  const { host } = deps();
  let enableError: string | undefined;
  try {
    await host.registrationEnable();
  } catch (error) {
    enableError = error instanceof Error ? error.message : String(error);
  }
  const view = await queryHost();
  return enableError ? { ...view, enableError } : view;
}

/** Withdraw the Host's OS registration. Does not touch the Registry or Sessions. */
export async function stopProductBackground(): Promise<ProductBackgroundView> {
  await deps()
    .host.registrationStop()
    .catch(() => undefined);
  return queryHost();
}
