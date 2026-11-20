import { hostRegistrationAccess } from "../host/registration";
import { setBackgroundOrchestration } from "./orchestration";

/** Wire Background orchestration to the Host's loopback registration API. */
export function wireBackgroundOrchestration(): void {
  setBackgroundOrchestration({ host: hostRegistrationAccess });
}

export {
  backgroundServicesRunnable,
  decodeRegistrationSnapshot,
  REGISTRATION_CONTRACT_VERSION,
  type RegistrationPhase,
  type RegistrationSnapshot,
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

wireBackgroundOrchestration();
