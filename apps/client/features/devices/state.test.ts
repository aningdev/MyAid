/**
 * The Devices follow: a generation change drops the old list, a stopped follow
 * ignores a late frame, and a dropped socket stays down. The transport is a
 * fake; nothing listens on a port.
 */
import { expect, test } from "nsh/test";

import { createHostTransport, type HostSocket } from "../../lib/host/client";
import { setHostTransport } from "../../lib/host/control";
import type { HostStatus, PairedDevice } from "../../lib/host/protocol";
import { PHONE, TABLET } from "./fixture";
import {
  createPairing,
  devicesError,
  devicesPhase,
  followDevices,
  pairedDevices,
  pairingTicket,
  stopDevices,
} from "./state";

const RELAY = { configured: true, connected: true, runnerId: "runner", reason: null };
const UNCONFIGURED = {
  configured: false,
  connected: false,
  runnerId: null,
  reason: "DSH_BOT_RELAY_URL is not a usable Relay address: no",
};

function ready(generation: string): HostStatus {
  return {
    phase: "ready",
    version: "test",
    blocked: false,
    generation,
    pid: 1,
    reason: null,
    url: null,
  };
}

function reply(body: unknown, status = 200): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status < 400,
    status,
    text: async () => text,
    json: async () => JSON.parse(text) as unknown,
  } as unknown as Response;
}

function until(ready: () => boolean, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (ready()) resolve();
      else if (Date.now() - start > 800) reject(new Error(label));
      else setTimeout(tick, 10);
    };
    tick();
  });
}

function plane(options: { unconfigured?: boolean } = {}) {
  let devices: PairedDevice[] = [{ ...PHONE }];
  const relay = options.unconfigured ? UNCONFIGURED : RELAY;
  let socket: HostSocket | undefined;
  let posts = 0;
  const transport = createHostTransport({
    allow: () => true,
    token: async () => "fixture-token",
    port: () => 9,
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (path === "/bridge/devices" && method === "GET") return reply({ devices, relay });
      if (path === "/bridge/pairing" && method === "POST") {
        posts += 1;
        return reply({ link: "https://relay.example/pair#fixture", expiresAt: 9_999_999_999 });
      }
      return reply("nope", 404);
    },
    socket: () => {
      const next: HostSocket = {
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        close: () => undefined,
      };
      socket = next;
      return next;
    },
  });
  return {
    transport,
    posts: () => posts,
    replace(next: PairedDevice[]) {
      devices = next;
    },
    frame(data: unknown) {
      socket?.onmessage?.({ data: JSON.stringify(data) });
    },
    close() {
      socket?.onclose?.({});
    },
  };
}

test("a new Host generation drops the old list and reads again", async () => {
  const host = plane();
  setHostTransport(host.transport);
  try {
    await followDevices();
    expect(pairedDevices().map((device) => device.deviceId)).toEqual(["phone-1"]);
    host.frame(ready("g1"));
    host.replace([{ ...TABLET }]);
    host.frame(ready("g2"));
    await until(() => pairedDevices()[0]?.deviceId === "tablet-1", "generation refresh");
    expect(devicesPhase()).toBe("ready");
  } finally {
    stopDevices();
    setHostTransport(null);
  }
});

test("a frame after stop does not replace the list", async () => {
  const host = plane();
  setHostTransport(host.transport);
  try {
    await followDevices();
    expect(pairedDevices()[0]?.name).toBe("Pocket");
    stopDevices();
    host.frame({ event: "bridge.devices", devices: [{ ...TABLET }] });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(pairedDevices().map((device) => device.deviceId)).toEqual(["phone-1"]);
    expect(pairingTicket()).toBeNull();
  } finally {
    setHostTransport(null);
  }
});

test("a dropped socket stays down", async () => {
  const host = plane();
  setHostTransport(host.transport);
  try {
    await followDevices();
    host.close();
    await until(() => devicesPhase() === "down", "socket down");
    expect(devicesError()).toBeTruthy();
  } finally {
    stopDevices();
    setHostTransport(null);
  }
});

test("an unconfigured Relay does not ask for a pairing link", async () => {
  const host = plane({ unconfigured: true });
  setHostTransport(host.transport);
  try {
    await followDevices();
    expect(await createPairing()).toBe(false);
    expect(host.posts()).toBe(0);
    expect(pairingTicket()).toBeNull();
  } finally {
    stopDevices();
    setHostTransport(null);
  }
});
