/**
 * Host registration over its HTTP API: the route each verb takes, the token it carries, and a
 * refusal surfacing as an error. Every request here is a fake.
 */
import { expect, test } from "nsh/test";

import { t } from "../i18n";
import {
  createHostRegistrationTransport,
  setHostRegistrationTransport,
  hostRegistrationAccess,
} from "./registration";

type Call = { url: string; method: string; headers: Record<string, string> };

type FakeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function recorder(respond: (call: Call) => { body: unknown; status?: number }) {
  const calls: Call[] = [];
  const fetch: FakeFetch = async (url, init) => {
    const call: Call = {
      url: String(url),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const answer = respond(call);
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
  host: { unit: "host", phase: "registered" },
  relay: { unit: "relay", phase: "notRegistered" },
  availability: "degraded",
};

const unit = { unit: "host", phase: "registered" };

test("the verbs take their routes and carry the token", async () => {
  const { calls, fetch } = recorder((call) =>
    call.url.endsWith("/registration") ? { body: snapshot } : { body: unit },
  );
  const transport = createHostRegistrationTransport({
    port: () => 4873,
    token: async () => "tok",
    fetch,
  });
  expect((await transport.call("registrationQuery")).includes('"registered"')).toBe(true);
  await transport.call("registrationEnable");
  await transport.call("registrationStop");
  expect(
    calls.map((call) => `${call.method} ${call.url.replace("http://127.0.0.1:4873", "")}`),
  ).toEqual(["GET /registration", "POST /registration/enable", "POST /registration/stop"]);
  expect(calls.every((call) => call.headers.Authorization === "Bearer tok")).toBe(true);
});

test("a refusal is an error the panel can word", async () => {
  const { fetch } = recorder(() => ({ body: { error: "refused" }, status: 401 }));
  const transport = createHostRegistrationTransport({
    port: () => 4873,
    token: async () => "tok",
    fetch,
  });
  await expect(transport.call("registrationEnable")).rejects.toThrow(
    t("host.registration.request", { path: "/registration/enable", status: 401 }),
  );
});

test("the product access decodes a snapshot and a unit", async () => {
  const { fetch } = recorder((call) =>
    call.url.endsWith("/registration") ? { body: snapshot } : { body: unit },
  );
  setHostRegistrationTransport(
    createHostRegistrationTransport({ port: () => 4873, token: async () => "tok", fetch }),
  );
  try {
    const read = await hostRegistrationAccess.registrationQuery();
    expect(read.host.phase).toBe("registered");
    expect(read.relay.phase).toBe("notRegistered");
    expect((await hostRegistrationAccess.registrationEnable()).unit).toBe("host");
  } finally {
    setHostRegistrationTransport(null);
  }
});
