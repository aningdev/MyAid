/**
 * Narrow Session facade used by Dialogue: connect → create/resume → follow/prompt/cancel.
 */
import { resolveDshLoginUrl } from "../host/control";
import {
  Connection,
  type ApprovalDecision,
  type ApprovalRequest,
  type ModelCatalog,
  readableError,
} from "./connection";

export type { ApprovalDecision, ApprovalRequest, ModelCatalog };
export { readableError };

/** Default Session id used on first connect when none is selected. */
export const PRIMARY_SESSION_ID = "myaid-primary";

let shared: Connection | undefined;
let sessionId: string | undefined;

export function getConnection(): Connection | undefined {
  return shared;
}

export function currentSessionId(): string | undefined {
  return sessionId;
}

export function setActiveSessionId(id: string | undefined): void {
  sessionId = id;
}

export async function ensureConnected(loginUrl?: string): Promise<Connection> {
  if (shared?.ready) return shared;
  if (shared) await shared.dispose().catch(() => undefined);
  const connection = new Connection();
  await connection.connect(loginUrl ?? (await resolveDshLoginUrl()));
  shared = connection;
  return connection;
}

/** Resume/create the fixed primary Session (first-run default). */
export async function ensurePrimarySession(connection?: Connection): Promise<string> {
  const conn = connection ?? (await ensureConnected());
  if (sessionId) return sessionId;
  const created = await conn.createSession({ sessionId: PRIMARY_SESSION_ID });
  sessionId = created.sessionId;
  return sessionId;
}

/** Create a Session in a Bot workspace and make it the followed id. */
export async function createBoundSession(
  connection: Connection | undefined,
  request: { cwd?: string; agentPreset?: string },
): Promise<string> {
  const conn = connection ?? (await ensureConnected());
  const created = await conn.createSession(request);
  sessionId = created.sessionId;
  return sessionId;
}

/** Create a brand-new official Session and make it active. */
export async function createNewSession(connection?: Connection): Promise<string> {
  const conn = connection ?? (await ensureConnected());
  const created = await conn.createSession({});
  sessionId = created.sessionId;
  return sessionId;
}

export async function listSessions(
  connection?: Connection,
): Promise<{ sessionId: string; cwd?: string; blank: boolean; updatedAt: number }[]> {
  const conn = connection ?? shared ?? (await ensureConnected());
  return conn.listSessions();
}

export async function listAgentPresets(
  connection?: Connection,
): Promise<
  { id: string; name: string; description?: string; isDefault: boolean; broken?: string }[]
> {
  const conn = connection ?? shared ?? (await ensureConnected());
  return conn.listAgentPresets();
}

export function setApprovalHandler(
  handler: (request: ApprovalRequest) => Promise<ApprovalDecision>,
): void {
  shared?.approvals(handler);
}

export async function disposeSession(): Promise<void> {
  sessionId = undefined;
  const conn = shared;
  shared = undefined;
  if (conn) await conn.dispose().catch(() => undefined);
}
