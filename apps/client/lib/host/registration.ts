import {
  decodeRegistrationSnapshot,
  decodeUnitRegistration,
  type RegistrationSnapshot,
  type UnitRegistration,
} from "../background/protocol";
/**
 * Host unit Background Service registration over the Host's loopback HTTP API.
 *
 * The Host reports only its own unit's fact; the Relay's phase in that snapshot stays
 * `notRegistered`, and `lib/background` merges the two.
 */
import { hostBaseUrl, hostPort, hostToken } from "./client";

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

/** The HTTP transport the product uses; `call` answers the response body as text. */
export function createHostRegistrationTransport(
  options: {
    port?: () => number;
    token?: () => Promise<string | null>;
    fetch?: typeof fetch;
  } = {},
): HostRegistrationTransport {
  const port = options.port ?? hostPort;
  const token = options.token ?? (() => hostToken());
  const request = options.fetch ?? fetch;

  return {
    reachable: async () => {
      try {
        const response = await request(`${hostBaseUrl(port())}/`, { method: "GET" });
        return response.ok;
      } catch {
        return false;
      }
    },

    call: async (op) => {
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
        throw new Error(`宿主登记请求失败：${route.path} ${response.status}`);
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

  registrationEnable: async (): Promise<UnitRegistration> =>
    decodeUnitRegistration(await transport.call("registrationEnable")),

  registrationStop: async (): Promise<UnitRegistration> =>
    decodeUnitRegistration(await transport.call("registrationStop")),
};
