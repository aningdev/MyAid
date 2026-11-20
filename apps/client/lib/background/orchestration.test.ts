import { expect, test } from "nsh/test";

import {
  enableProductBackground,
  queryProductBackground,
  setBackgroundOrchestration,
  stopProductBackground,
  type BackgroundRegistrationClient,
} from "./orchestration";
import type { RegistrationPhase, RegistrationSnapshot } from "./protocol";

function snap(phase: RegistrationPhase, reason?: string): RegistrationSnapshot {
  return {
    version: 1,
    phase,
    ...(reason === undefined ? {} : { reason }),
  };
}

function fakeClient(script: {
  query: RegistrationSnapshot;
  enable?: RegistrationSnapshot;
  enableError?: string;
  stop?: RegistrationSnapshot;
}): BackgroundRegistrationClient & { calls: string[] } {
  let query = script.query;
  const calls: string[] = [];
  return {
    calls,
    reachable: async () => true,
    registrationQuery: async () => query,
    registrationEnable: async () => {
      calls.push("registrationEnable");
      if (script.enableError) throw new Error(script.enableError);
      if (script.enable) query = script.enable;
      return query;
    },
    registrationStop: async () => {
      calls.push("registrationStop");
      query = script.stop ?? snap("notRegistered");
      return query;
    },
  };
}

test("queryProductBackground returns the Host snapshot", async () => {
  setBackgroundOrchestration({
    host: fakeClient({ query: snap("registered", "running") }),
  });
  try {
    const view = await queryProductBackground();
    expect(view.phase).toBe("registered");
    expect(view.reason).toBe("running");
    expect(view.enableError).toBeUndefined();
  } finally {
    setBackgroundOrchestration(null);
  }
});

test("enableProductBackground keeps an enable failure beside the Host snapshot", async () => {
  const host = fakeClient({
    query: snap("notRegistered"),
    enableError: "开发态显式 Host 无法向系统登记",
  });
  setBackgroundOrchestration({ host });
  try {
    const view = await enableProductBackground();
    expect(host.calls).toEqual(["registrationEnable"]);
    expect(view.phase).toBe("notRegistered");
    expect(view.enableError).toMatch(/开发态/);
  } finally {
    setBackgroundOrchestration(null);
  }
});

test("stopProductBackground withdraws only the Host registration", async () => {
  const host = fakeClient({
    query: snap("registered"),
    stop: snap("notRegistered"),
  });
  setBackgroundOrchestration({ host });
  try {
    const view = await stopProductBackground();
    expect(host.calls).toEqual(["registrationStop"]);
    expect(view.phase).toBe("notRegistered");
  } finally {
    setBackgroundOrchestration(null);
  }
});
