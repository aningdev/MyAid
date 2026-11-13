/**
 * Official React-free Client model types: the Session list/window/snapshot and
 * the Workspace projection the product projects into its own views. Not wire
 * types (see `./session` and `./workspace` for those), but the same pinned
 * packages. Named exports only: both client faces export `apply` / `inject`.
 */
export type {
  AssistantLiveChunkEvent,
  BeginSubmissionInput,
  ISession,
  ISessions,
  SessionFace,
  SubmissionHandle,
  OpenState,
  ProjectionsFace,
  PromptError,
  SessionAssistantSettlementEntry,
  SessionBinding,
  SessionEventChange,
  SessionEventLike,
  SessionEventLikeEntry,
  SessionEventSource,
  SessionEventWindow,
  SessionListPhase,
  SessionListState,
  SessionProjectionSnapshot,
  SessionReference,
  SessionRetainInfo,
  SessionRetainOptions,
  SessionSnapshot,
  SessionSummary,
  SessionTarget,
  SessionTransientEventEntry,
  PendingSubmission,
  PendingSubmissionAttachment,
  PendingSubmissionPlacement,
} from "@deepseek-ai/dsh-api-session-controller/client";
export type {
  ClientWorkspaceModel,
  IWorkspaces,
  SessionActivity,
  SessionActivityItem,
  SessionActivityKind,
  WorkspaceListPhase,
  WorkspaceSnapshot,
  WorkspaceSource,
  WorkspaceView,
  WorkspaceId,
} from "@deepseek-ai/dsh-api-workspace-controller/client";
export type { ObservableSnapshot, SnapshotStore } from "@deepseek-ai/dsh-client-store";
export type { SessionId, SessionSeq } from "@deepseek-ai/dsh-session/types";
