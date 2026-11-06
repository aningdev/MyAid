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
export type {
  AgentPresetDetail,
  AgentPresetSummary,
  ApprovalDecision,
  ApprovalRequest,
  CatalogModel,
  FlatCatalogModel,
  FlatModelCatalog,
  ModelCatalog,
} from "./connection";
export { flattenModelCatalog } from "./connection";
export type { SessionFollowFrame } from "@myaid/dsh-web-protocol/session";
export type { ApprovalOutcome, ApprovalRequestEvent } from "@myaid/dsh-web-protocol/interaction";
