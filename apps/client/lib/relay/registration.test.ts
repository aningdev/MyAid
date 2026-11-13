/**
 * Relay registration over the Relay's own HTTP API: a Relay that is not running is a fact with a
 * reason (not a broken panel), and a running one answers the same snapshot shape as the Host.
 */
import { expect, test } from "nsh/test";

import { t } from "../i18n";
import {
  createRelayRegistrationTransport,
  relayRegistrationAccess,
  setRelayRegistrationTransport,
} from "./registration";

type Call = { url: string; method: string; headers: Record<string, string> };

type FakeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function recorder(respond: (call: Call) => { body: unknown; status?: number } | "refuse") {
  const calls: Call[] = [];
  const fetch: FakeFetch = async (url, init) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const answer = respond(call);
    if (answer === "refuse") throw new Error("ECONNREFUSED");
    const text = JSON.stringify(answer.body);
    return {
      ok: (answer.status ?? 200) < 400,
      status: answer.status ?? 200,
      text: async () => text,
      json: async () => answer.body,
    } as unknown as Response;
  };
  return { calls, fetch };
}

const snapshot = {
  version: 1,
  host: { unit: "host", phase: "notRegistered" },
  relay: { unit: "relay", phase: "pendingApproval" },
  availability: "degraded",
};

test("a Relay that is not running is a fact with a reason", async () => {
  const { calls, fetch } = recorder(() => "refuse");
  setRelayRegistrationTransport(
    createRelayRegistrationTransport({ port: () => 8787, token: async () => "tok", fetch }),
  );
  try {
    const read = await relayRegistrationAccess.registrationQuery();
    expect(read.relay.phase).toBe("notRegistered");
    expect(String(read.relay.reason)).toContain(t("relay.notRunning"));
    expect(calls[0]?.url).toBe("http://127.0.0.1:8787/v1/health");
    await expect(relayRegistrationAccess.registrationEnable()).rejects.toThrow(
      t("relay.registerFailed"),
    );
  } finally {
    setRelayRegistrationTransport(null);
  }
});

test("a running Relay answers its own unit's snapshot with the token", async () => {
  const { calls, fetch } = recorder((call) =>
    call.url.endsWith("/v1/health") ? { body: { service: "myaid-relay" } } : { body: snapshot },
  );
  setRelayRegistrationTransport(
    createRelayRegistrationTransport({ port: () => 8787, token: async () => "tok", fetch }),
  );
  try {
    const read = await relayRegistrationAccess.registrationQuery();
    expect(read.relay.phase).toBe("pendingApproval");
    const registration = calls.find((call) => call.url.endsWith("/registration"));
    expect(registration?.headers.Authorization).toBe("Bearer tok");
  } finally {
    setRelayRegistrationTransport(null);
  }
});
