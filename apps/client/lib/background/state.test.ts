import { platform } from "nsh";
import { expect, test } from "nsh/test";

import { setBackgroundOrchestration, type BackgroundRegistrationClient } from "./orchestration";
import {
  backgroundServicesRunnable,
  type RegistrationPhase,
  type RegistrationSnapshot,
} from "./protocol";
import {
  enableBackgroundFromState,
  productBackgroundState,
  refreshProductBackgroundState,
  resetProductBackgroundStateForTests,
} from "./state";

function snap(phase: RegistrationPhase): RegistrationSnapshot {
  return { version: 1, phase };
}

function delayedClient(
  queryDelayMs: number,
  phase: RegistrationPhase,
): BackgroundRegistrationClient {
  let query = snap(phase);
  return {
    reachable: async () => true,
    registrationQuery: async () => {
      await new Promise((resolve) => setTimeout(resolve, queryDelayMs));
      return query;
    },
    registrationEnable: async () => {
      query = snap("registered");
      return query;
    },
    registrationStop: async () => {
      query = snap("notRegistered");
      return query;
    },
  };
}

test("refresh drops stale results when a newer mutation finishes first", async () => {
  if (!backgroundServicesRunnable(platform.os)) {
    return;
  }
  resetProductBackgroundStateForTests();
  setBackgroundOrchestration({ host: delayedClient(50, "notRegistered") });
  try {
    const slowRefresh = refreshProductBackgroundState();
    const enable = await enableBackgroundFromState();
    expect(enable.view?.phase).toBe("registered");
    await slowRefresh;
    expect(productBackgroundState().view?.phase).toBe("registered");
  } finally {
    setBackgroundOrchestration(null);
    resetProductBackgroundStateForTests();
  }
});
