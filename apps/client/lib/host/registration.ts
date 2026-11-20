/**
 * Host Background Service registration over the Host's loopback HTTP API.
 * Query, enable and stop all return the same snapshot.
 */
import {
  decodeRegistrationSnapshot,
  type RegistrationSnapshot,
} from "../background/protocol";
import { hostControlAllowed } from "../data-root";
import { t } from "../i18n";
import { hostBaseUrl, hostPort, hostToken, noControlInTest } from "./client";

export type HostRegistrationOp = "registrationQuery" | "registrationEnable" | "registrationStop";

export type HostRegistrationTransport = {
  reachable(): Promise<boolean>;
  call(op: HostRegistrationOp): Promise<string>;
};

const ROUTES: Record<HostRegistrationOp, { path: string; method: string }> = {
  registrationQuery: { path: "/registration", method: "GET" },
  registrationEnable: { path: "/registration/enable", method: "POST" },
  registrationStop: { path: "/registration/stop", method: "POST" },
};

/** A test app's fact: nothing was asked, so nothing is registered. */
function testSnapshot(): string {
  return JSON.stringify({
    version: 1,
    phase: "notRegistered",
    reason: noControlInTest(),
  });
}

/** The HTTP transport the product uses; `call` answers the response body as text. */
export function createHostRegistrationTransport(
  options: {
    port?: () => number;
    token?: () => Promise<string | null>;
    fetch?: typeof fetch;
    /** Whether this app may reach the control plane at all; a test replaces it. */
    allow?: () => boolean;
  } = {},
): HostRegistrationTransport {
  const port = options.port ?? hostPort;
  const token = options.token ?? (() => hostToken());
  const request = options.fetch ?? fetch;
  const allow = options.allow ?? hostControlAllowed;

  return {
    reachable: async () => {
      if (!allow()) return false;
      try {
        const response = await request(`${hostBaseUrl(port())}/`, { method: "GET" });
        return response.ok;
      } catch {
        return false;
      }
    },

    call: async (op) => {
      if (!allow()) {
        // Querying is a fact ("nothing asked"), while a verb the user starts is refused.
        if (op === "registrationQuery") return testSnapshot();
        throw new Error(noControlInTest());
      }
      const route = ROUTES[op];
      const headers: Record<string, string> = {};
      const bearer = await token();
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      let body: string | undefined;
      if (route.method === "POST") {
        headers["Content-Type"] = "application/json";
        body = "{}";
      }
      const response = await request(`${hostBaseUrl(port())}${route.path}`, {
        method: route.method,
        headers,
        body,
      });
      if (!response.ok) {
        throw new Error(
          t("host.registration.request", { path: route.path, status: response.status }),
        );
      }
      return await response.text();
    },
  };
}

let transport: HostRegistrationTransport = createHostRegistrationTransport();

export function setHostRegistrationTransport(next: HostRegistrationTransport | null): void {
  transport = next ?? createHostRegistrationTransport();
}

export const hostRegistrationAccess = {
  reachable: () => transport.reachable(),

  registrationQuery: async (): Promise<RegistrationSnapshot> =>
    decodeRegistrationSnapshot(await transport.call("registrationQuery")),

  registrationEnable: async (): Promise<RegistrationSnapshot> =>
    decodeRegistrationSnapshot(await transport.call("registrationEnable")),

  registrationStop: async (): Promise<RegistrationSnapshot> =>
    decodeRegistrationSnapshot(await transport.call("registrationStop")),
};
