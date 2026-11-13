/**
 * Relay unit Background Service registration over the Relay's own loopback HTTP API.
 *
 * The Relay is a separate process with its own port and token (`<data root>/relay/serve-token`);
 * it reports only its own unit's fact. A Relay that is not running is a fact, not an error: the
 * panel says so and the Host's half still shows.
 */
import { readFile } from "fs/promises";
import { join } from "path";

import {
  decodeRegistrationSnapshot,
  decodeUnitRegistration,
  type RegistrationSnapshot,
  type UnitRegistration,
} from "../background/protocol";
import { hostControlAllowed } from "../data-root";
import { hostDataRoot } from "../host/launcher";

/** The Relay's control port when nothing names one (`MYAID_RELAY_PORT`). */
export const DEFAULT_RELAY_PORT = 8787;

export type RelayRegistrationOp = "registrationQuery" | "registrationEnable" | "registrationStop";

export type RelayRegistrationTransport = {
  reachable(): Promise<boolean>;
  call(op: RelayRegistrationOp): Promise<string>;
};

const ROUTES: Record<RelayRegistrationOp, { path: string; method: string }> = {
  registrationQuery: { path: "/registration", method: "GET" },
  registrationEnable: { path: "/registration/enable", method: "POST" },
  registrationStop: { path: "/registration/stop", method: "POST" },
};

export function relayPort(): number {
  const raw = typeof process !== "undefined" && process.env ? process.env.MYAID_RELAY_PORT : "";
  const port = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_RELAY_PORT;
}

export async function relayToken(root: string = hostDataRoot()): Promise<string | null> {
  try {
    const token = (await readFile(join(root, "relay", "serve-token"), "utf8")).trim();
    return token ? token : null;
  } catch {
    return null;
  }
}

/** A Relay that is not there reports as unregistered with the reason. */
function notRunning(reason: string): RegistrationSnapshot {
  return {
    version: 1,
    host: { unit: "host", phase: "notRegistered" },
    relay: { unit: "relay", phase: "notRegistered", reason },
    availability: "off",
  };
}

export function createRelayRegistrationTransport(
  options: {
    port?: () => number;
    token?: () => Promise<string | null>;
    fetch?: typeof fetch;
    /** Whether this app may reach the control plane at all; a test replaces it. */
    allow?: () => boolean;
  } = {},
): RelayRegistrationTransport {
  const port = options.port ?? relayPort;
  const token = options.token ?? (() => relayToken());
  const request = options.fetch ?? fetch;
  const allow = options.allow ?? hostControlAllowed;
  const url = (path: string) => `http://127.0.0.1:${port()}${path}`;

  return {
    reachable: async () => {
      if (!allow()) return false;
      try {
        const response = await request(url("/v1/health"), { method: "GET" });
        return response.ok;
      } catch {
        return false;
      }
    },

    call: async (op) => {
      if (!allow()) throw new Error("测试应用不连接本机控制面");
      const route = ROUTES[op];
      const headers: Record<string, string> = {};
      const bearer = await token();
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      let body: string | undefined;
      if (route.method === "POST") {
        headers["Content-Type"] = "application/json";
        body = "{}";
      }
      const response = await request(url(route.path), {
        method: route.method,
        headers,
        body,
      });
      if (!response.ok) {
        throw new Error(`转发登记请求失败：${route.path} ${response.status}`);
      }
      return await response.text();
    },
  };
}

let transport: RelayRegistrationTransport = createRelayRegistrationTransport();

export function setRelayRegistrationTransport(next: RelayRegistrationTransport | null): void {
  transport = next ?? createRelayRegistrationTransport();
}

export const relayRegistrationAccess = {
  reachable: () => transport.reachable(),

  registrationQuery: async (): Promise<RegistrationSnapshot> => {
    if (!(await transport.reachable())) {
      return notRunning("Relay 未运行：请 cargo run -p myaid-relay -- serve-app，或登记为后台服务");
    }
    return decodeRegistrationSnapshot(await transport.call("registrationQuery"));
  },

  registrationEnable: async (): Promise<UnitRegistration> => {
    if (!(await transport.reachable())) {
      throw new Error("Relay 未运行，无法向系统登记");
    }
    return decodeUnitRegistration(await transport.call("registrationEnable"));
  },

  registrationStop: async (): Promise<UnitRegistration> => {
    if (!(await transport.reachable())) {
      throw new Error("Relay 未运行，无法注销系统登记");
    }
    return decodeUnitRegistration(await transport.call("registrationStop"));
  },
};
