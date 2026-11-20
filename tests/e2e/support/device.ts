// The Device side of a case: an in-memory Storage and the Client's real relay
// Carrier. Nothing here speaks Noise itself.

import { Connection, liveBots, liveTickets } from "@dsh-bot/client/dsh";
import {
  createRelayCarrier,
  loadDeviceIdentity,
  loadPairing,
  pairDevice,
  type RelayCarrier,
  type StorageLike,
} from "@dsh-bot/client/relay";

import type { Plumbing } from "./harness";

export function memoryStorage(): StorageLike & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => void values.set(key, value),
    removeItem: async (key) => void values.delete(key),
  };
}

export interface Device {
  readonly storage: ReturnType<typeof memoryStorage>;
  readonly carrier: RelayCarrier;
  readonly deviceId: string;
  /** How often `onRevoked` fired. */
  readonly revoked: { count: number };
  url(path: string): string;
}

/** Pairs a new Device through the Host's control surface and opens its Carrier. */
export async function pairedDevice(stack: Plumbing, name: string): Promise<Device> {
  const answer = (await (await stack.host("/bridge/pairing", { method: "POST" })).json()) as {
    link: string;
  };
  const storage = memoryStorage();
  // The link stays in memory: it goes straight to the Device and nowhere else.
  const paired = await pairDevice(answer.link, { name, platform: "e2e", storage });
  paired.tunnel.close();
  const identity = await loadDeviceIdentity(storage);
  const pairing = await loadPairing(storage);
  if (!pairing) throw new Error("pairing was not stored");
  const revoked = { count: 0 };
  const carrier = createRelayCarrier({
    pairing,
    identity,
    storage,
    onRevoked: () => void (revoked.count += 1),
  });
  return {
    storage,
    carrier,
    deviceId: pairing.deviceId,
    revoked,
    url: (path) => new URL(path, carrier.streamBaseUrl).href,
  };
}

/** A paired Device with the Client's own Connection to dsh, through its Carrier. */
export interface ConnectedDevice extends Device {
  readonly connection: Connection;
  readonly bots: ReturnType<typeof liveBots>;
  readonly tickets: ReturnType<typeof liveTickets>;
  close(): Promise<void>;
}

export async function connectedDevice(stack: Plumbing, name: string): Promise<ConnectedDevice> {
  const device = await pairedDevice(stack, name);
  const connection = new Connection();
  await connection.connectThrough(device.carrier);
  return {
    ...device,
    connection,
    bots: liveBots(connection.botsNamespace()),
    tickets: liveTickets(connection.ticketsNamespace()),
    async close() {
      await connection.dispose();
      device.carrier.close();
    },
  };
}

/** A Session the way a chat panel holds it: retained, ready, with the official face to prompt. */
export async function openSession(device: ConnectedDevice, sessionId: string) {
  const reference = device.connection.sessions.retain(
    sessionId as never,
    {
      source: "panel",
    } as never,
  );
  await reference.ready;
  return { session: reference.binding.session, release: () => reference.release() };
}
