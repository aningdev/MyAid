/**
 * A fake Host control plane for Devices tests. Nothing here listens on a port
 * or reads a data root. The pairing link is a fixture, not a secret.
 */
import { createHostTransport, type HostSocket, type HostTransport } from "../../lib/host/client";
import type { PairedDevice, RelayStatus } from "../../lib/host/protocol";

/** The Host's real unset sentence, so the page maps the words it will see. */
export const UNSET_REASON =
  "DSH_BOT_RELAY_URL is unset; DEFAULT_RELAY_URL (https://default-relay-url.invalid) is a placeholder, not a usable Relay";

export const PAIRING_LINK = "https://relay.example/pair#v=1&r=runner&k=a2V5&p=cHNr&e=999";

export const PHONE: PairedDevice = {
  deviceId: "phone-1",
  name: "Pocket",
  platform: "ios",
  pairedAt: 1_763_000_000,
  lastSeenAt: 1_763_600_000,
  online: true,
};

export const TABLET: PairedDevice = {
  deviceId: "tablet-1",
  name: "Slate",
  platform: "android",
  pairedAt: 1_763_100_000,
  lastSeenAt: 0,
  online: false,
};

const READY_RELAY: RelayStatus = {
  configured: true,
  connected: true,
  runnerId: "runner",
  reason: null,
};

const UNSET_RELAY: RelayStatus = {
  configured: false,
  connected: false,
  runnerId: null,
  reason: UNSET_REASON,
};

export type DevicesFixtureOptions = {
  unconfigured?: boolean;
  /** The issued link is already past its `expiresAt`. */
  expired?: boolean;
  /** After `/watch` opens, push a second Device. */
  watch?: boolean;
};

function reply(body: unknown, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status < 400,
    status,
    text: async () => text,
    json: async () => JSON.parse(text) as unknown,
  } as unknown as Response;
}

/** The control plane the Devices page talks to in tests. */
export function createDevicesFixture(options: DevicesFixtureOptions = {}): HostTransport {
  let devices: PairedDevice[] = options.unconfigured ? [] : [{ ...PHONE }];
  const relay = options.unconfigured ? UNSET_RELAY : READY_RELAY;
  return createHostTransport({
    allow: () => true,
    token: async () => "fixture-token",
    port: () => 9,
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/bridge/devices" && method === "GET") return reply({ devices, relay });
      if (path === "/bridge/pairing" && method === "POST") {
        if (!relay.configured) return reply({ error: UNSET_REASON }, 409);
        const expiresAt = options.expired ? 1 : Math.floor(Date.now() / 1000) + 300;
        return reply({ link: PAIRING_LINK, expiresAt });
      }
      if (method === "DELETE" && path.startsWith("/bridge/devices/")) {
        const id = decodeURIComponent(path.slice("/bridge/devices/".length));
        if (!devices.some((device) => device.deviceId === id)) {
          return reply({ error: "unknown device" }, 404);
        }
        devices = devices.filter((device) => device.deviceId !== id);
        return reply({ devices, relay });
      }
      // A liveness probe that is not `dsh-bot` keeps the shell from connecting.
      return reply("nope", 404);
    },
    socket: () => {
      const socket: HostSocket = {
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        close: () => undefined,
      };
      if (options.watch) {
        setTimeout(() => {
          socket.onmessage?.({
            data: JSON.stringify({
              event: "bridge.devices",
              devices: [...devices, { ...TABLET }],
            }),
          });
        }, 0);
      }
      return socket;
    },
  });
}
