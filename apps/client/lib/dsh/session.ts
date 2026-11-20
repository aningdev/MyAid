/**
 * Thin Connection adapter for Dialogue: the one shared Connection, its error
 * wording, and the two reads the product makes outside a Session (agent
 * presets, directory picking). Product lifecycle lives in ClaimedSession; the
 * Session model itself belongs to the official Client (`ctx.sessions`).
 */
import { resolveDshLoginUrl } from "../host/control";
import { Connection, readableError } from "./connection";

export { readableError };

let shared: Connection | undefined;
/**
 * Handlers every Connection needs (approvals, generation changes). It runs on
 * each instance **before** it connects and on the current one when registered:
 * whoever creates the Connection — a Workspace command, a Panel — must not be
 * the one that remembers to wire approval routing, and a
 * replacement Connection would otherwise come up unwired.
 */
let prepare: ((connection: Connection) => void) | undefined;

/**
 * Install the handlers every Connection carries, now and for later ones.
 * @param prepareConnection - called with each instance before it connects.
 */
export function prepareConnections(prepareConnection: (connection: Connection) => void): void {
  prepare = prepareConnection;
  if (shared) prepareConnection(shared);
}

/** The shared Connection when it is already up. Does not open one. */
export function connectedSession(): Connection | undefined {
  return shared?.ready ? shared : undefined;
}

/** The shared Connection, connected on demand. */
export async function ensureConnected(loginUrl?: string): Promise<Connection> {
  if (shared?.ready) {
    prepare?.(shared);
    return shared;
  }
  if (shared) await shared.dispose().catch(() => undefined);
  const connection = new Connection();
  prepare?.(connection);
  await connection.connect(loginUrl ?? (await resolveDshLoginUrl()));
  shared = connection;
  return connection;
}

export async function listAgentPresets(
  connection?: Connection,
): Promise<
  { id: string; name: string; description?: string; isDefault: boolean; broken?: string }[]
> {
  const conn = connection ?? shared ?? (await ensureConnected());
  return conn.listAgentPresets();
}

export async function pickDirectory(connection?: Connection): Promise<string | null> {
  const conn = connection ?? shared ?? (await ensureConnected());
  return conn.pickDirectory();
}

export async function disposeSession(): Promise<void> {
  const conn = shared;
  shared = undefined;
  if (conn) await conn.dispose().catch(() => undefined);
}
