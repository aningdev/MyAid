export {
  assertStandardCookieHandshakeBlocked,
  fetchSessionCookie,
  muxWebSocketUrl,
  openAuthenticatedMux,
  resolveLoginUrl,
  smokeDshAuthTransport,
  type DshLogin,
} from "./auth";
export { AuthenticatedSocket } from "./socket";

// Connection / Session pull the prepared Node SDK (`sdk.js`). Import from
// `./connection` or `./session` deliberately (Dialogue loads them lazily).
export type { ApprovalDecision, ApprovalRequest, CatalogModel, ModelCatalog } from "./connection";
