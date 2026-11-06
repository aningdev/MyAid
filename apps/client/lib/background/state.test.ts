import { platform } from "nsh";
import { expect, test } from "nsh/test";

import { backgroundServicesRunnable } from "./protocol";
import type { RegistrationSnapshot } from "./protocol";
import { setBackgroundOrchestration, type BackgroundRegistrationClient } from "./orchestration";
import {
  enableBackgroundFromState,
  productBackgroundState,
  refreshProductBackgroundState,
  resetProductBackgroundStateForTests,
} from "./state";

function snap(hostPhase: RegistrationSnapshot["host"]["phase"]): RegistrationSnapshot {
  return {
    version: 1,
    host: { unit: "host", phase: hostPhase, reason: null },
    relay: { unit: "relay", phase: "notRegistered", reason: null },
    availability: "off",
  };
}

function delayedClient(
  side: "host" | "relay",
  queryDelayMs: number,
  phase: RegistrationSnapshot["host"]["phase"],
): BackgroundRegistrationClient {
  let query = snap(phase);
  return {
    side,
    reachable: async () => true,
    registrationQuery: async () => {
      await new Promise((resolve) => setTimeout(resolve, queryDelayMs));
      return query;
    },
    registrationEnable: async () => {
      if (side === "host") {
        query = { ...query, host: { unit: "host", phase: "registered", reason: null } };
        return query.host;
      }
      query = { ...query, relay: { unit: "relay", phase: "registered", reason: null } };
      return query.relay;
    },
    registrationStop: async () => {
      if (side === "host") {
        query = { ...query, host: { unit: "host", phase: "notRegistered", reason: null } };
        return query.host;
      }
      query = { ...query, relay: { unit: "relay", phase: "notRegistered", reason: null } };
      return query.relay;
    },
  };
}

test("refresh drops stale results when a newer mutation finishes first", async () => {
  if (!backgroundServicesRunnable(platform.os)) {
    return;
  }
  resetProductBackgroundStateForTests();
  setBackgroundOrchestration({
    host: delayedClient("host", 50, "notRegistered"),
    relay: delayedClient("relay", 50, "notRegistered"),
  });
  try {
    const slowRefresh = refreshProductBackgroundState();
    const enable = await enableBackgroundFromState();
    expect(enable.view?.host.phase).toBe("registered");
    expect(enable.view?.relay.phase).toBe("registered");
    await slowRefresh;
    expect(productBackgroundState().view?.host.phase).toBe("registered");
    expect(productBackgroundState().view?.relay.phase).toBe("registered");
  } finally {
    setBackgroundOrchestration(null);
    resetProductBackgroundStateForTests();
  }
});
