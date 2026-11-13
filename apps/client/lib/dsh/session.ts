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

export async function ensureConnected(loginUrl?: string): Promise<Connection> {
  if (shared?.ready) return shared;
  if (shared) await shared.dispose().catch(() => undefined);
  const connection = new Connection();
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
