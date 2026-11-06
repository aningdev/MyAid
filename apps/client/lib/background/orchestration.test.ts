import { expect, test } from "nsh/test";

import type { RegistrationSnapshot } from "./protocol";
import {
  enableProductBackground,
  queryProductBackground,
  setBackgroundOrchestration,
  stopProductBackground,
  type BackgroundRegistrationClient,
} from "./orchestration";

function snap(
  hostPhase: RegistrationSnapshot["host"]["phase"],
  relayPhase: RegistrationSnapshot["relay"]["phase"],
): RegistrationSnapshot {
  return {
    version: 1,
    host: { unit: "host", phase: hostPhase, reason: null },
    relay: { unit: "relay", phase: relayPhase, reason: null },
    availability: "off",
  };
}

function fakeClient(
  side: "host" | "relay",
  script: {
    query: RegistrationSnapshot;
    enable?: RegistrationSnapshot["host"] | RegistrationSnapshot["relay"];
    enableError?: string;
    stop?: RegistrationSnapshot["host"] | RegistrationSnapshot["relay"];
  },
): BackgroundRegistrationClient {
  let query = script.query;
  return {
    side,
    reachable: async () => true,
    registrationQuery: async () => query,
    registrationEnable: async () => {
      if (script.enableError) throw new Error(script.enableError);
      if (script.enable) {
        if (side === "host") {
          query = { ...query, host: script.enable as RegistrationSnapshot["host"] };
        } else {
          query = { ...query, relay: script.enable as RegistrationSnapshot["relay"] };
        }
      }
      return side === "host" ? query.host : query.relay;
    },
    registrationStop: async () => {
      const phase = "notRegistered" as const;
      if (side === "host") {
        query = { ...query, host: { unit: "host", phase, reason: null } };
        return query.host;
      }
      query = { ...query, relay: { unit: "relay", phase, reason: null } };
      return query.relay;
    },
  };
}

test("queryProductBackground merges host and relay unit status", async () => {
  setBackgroundOrchestration({
    host: fakeClient("host", { query: snap("registered", "notRegistered") }),
    relay: fakeClient("relay", { query: snap("notRegistered", "registered") }),
  });
  try {
    const view = await queryProductBackground();
    expect(view.host.phase).toBe("registered");
    expect(view.relay.phase).toBe("registered");
    expect(view.availability).toBe("full");
  } finally {
    setBackgroundOrchestration(null);
  }
});

test("enableProductBackground orchestrates both units and tolerates dev enable rejection", async () => {
  const host = fakeClient("host", {
    query: snap("notRegistered", "notRegistered"),
    enableError: "开发态显式 Host 无法向系统登记",
  });
  const relay = fakeClient("relay", {
    query: snap("notRegistered", "notRegistered"),
    enable: { unit: "relay", phase: "registered", reason: null },
  });
  setBackgroundOrchestration({ host, relay });
  try {
    const view = await enableProductBackground();
    expect(view.host.phase).toBe("notRegistered");
    expect(view.relay.phase).toBe("registered");
    expect(view.availability).toBe("degraded");
    expect(view.enableErrors?.host).toMatch(/开发态/);
    expect(view.enableErrors?.relay).toBeUndefined();
  } finally {
    setBackgroundOrchestration(null);
  }
});

test("stopProductBackground only issues registrationStop on both sides", async () => {
  const hostCalls: string[] = [];
  const relayCalls: string[] = [];
  let hostQuery = snap("registered", "notRegistered");
  let relayQuery = snap("notRegistered", "registered");
  const host = fakeClient("host", { query: hostQuery });
  const relay = fakeClient("relay", { query: relayQuery });
  host.registrationQuery = async () => hostQuery;
  relay.registrationQuery = async () => relayQuery;
  host.registrationStop = async () => {
    hostCalls.push("registrationStop");
    hostQuery = snap("notRegistered", "notRegistered");
    return hostQuery.host;
  };
  relay.registrationStop = async () => {
    relayCalls.push("registrationStop");
    relayQuery = snap("notRegistered", "notRegistered");
    return relayQuery.relay;
  };
  setBackgroundOrchestration({ host, relay });
  try {
    const view = await stopProductBackground();
    expect(hostCalls).toEqual(["registrationStop"]);
    expect(relayCalls).toEqual(["registrationStop"]);
    expect(view.availability).toBe("off");
  } finally {
    setBackgroundOrchestration(null);
  }
});
