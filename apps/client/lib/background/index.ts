import { hostRegistrationAccess } from "../host/registration";
import { relayRegistrationAccess } from "../relay/registration";
import { setBackgroundOrchestration } from "./orchestration";

/** Wire product Background orchestration to native HostControl + RelayControl. */
export function wireNativeBackgroundOrchestration(): void {
  setBackgroundOrchestration({
    host: { side: "host", ...hostRegistrationAccess },
    relay: { side: "relay", ...relayRegistrationAccess },
  });
}

export {
  backgroundAvailability,
  backgroundServicesRunnable,
  decodeRegistrationSnapshot,
  decodeUnitRegistration,
  isRegisteredWithOs,
  mergeProductRegistration,
  REGISTRATION_CONTRACT_VERSION,
  type BackgroundAvailability,
  type ProductBackgroundRegistration,
  type RegistrationPhase,
  type RegistrationSnapshot,
  type ServiceUnit,
  type UnitRegistration,
} from "./protocol";

export {
  enableProductBackground,
  queryProductBackground,
  setBackgroundOrchestration,
  stopProductBackground,
  type BackgroundOrchestration,
  type BackgroundRegistrationClient,
  type ProductBackgroundView,
} from "./orchestration";

export {
  loadProductBackgroundState,
  productBackgroundState,
  refreshProductBackgroundState,
  enableBackgroundFromState,
  stopBackgroundFromState,
  type ProductBackgroundState,
} from "./state";

wireNativeBackgroundOrchestration();
