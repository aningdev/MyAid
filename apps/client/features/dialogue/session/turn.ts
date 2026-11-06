/**
 * Deep module: follow frames + local turn lifecycle → Dialogue messages / live / freeze.
 * SessionProjector stays as internal frame parser; freeze / turned races live here.
 */
import type { Msg, Status, Tool } from "../chat/scripts";
import { SessionProjector, type ProjectedChat } from "./projector";

export type FreezeOutcome = {
  status: Status;
  error?: string;
  messages: Msg[];
};

export type TurnView = {
  messages: Msg[];
  running: boolean;
  status: string;
  liveMd: string;
  liveReason: string;
  liveTools: Tool[];
  liveId: string | null;
  /** When set, the pane should commit the live bubble then call acknowledgeFreeze(). */
  pendingFreeze: FreezeOutcome | null;
};

type LocalTurn = {
  id: string;
  turned: boolean;
  cancelled: boolean;
};

function liveBusy(snap: ProjectedChat): boolean {
  return !!(snap.liveMd || snap.liveReason || snap.liveTools.length);
}

function mapFreezeStatus(status: string): Status {
  if (status.includes("失败")) return "error";
  if (status.includes("停止") || status.includes("中断")) return "stopped";
  return "done";
}

/** Owns projection + when a local prompt may freeze into history. */
export class TurnProjection {
  private projector = new SessionProjector();
  private local: LocalTurn | null = null;
  private liveAssistantId: string | null = null;
  private pendingFreeze: FreezeOutcome | null = null;

  /** User sent a prompt; `assistantId` is the placeholder bubble id. */
  beginTurn(assistantId: string): void {
    this.local = { id: assistantId, turned: false, cancelled: false };
    this.liveAssistantId = assistantId;
    this.pendingFreeze = null;
  }

  receive(frame: unknown): TurnView {
    const snap = this.projector.receive(frame);
    return this.afterSnap(snap);
  }

  applyError(message: string): TurnView {
    if (this.local && !this.local.cancelled) {
      this.pendingFreeze = {
        status: "error",
        error: message,
        messages: this.projector.snapshot().messages,
      };
      this.local = null;
    }
    return this.snapshot();
  }

  cancel(): TurnView {
    if (!this.local) return this.snapshot();
    this.local.cancelled = true;
    this.pendingFreeze = {
      status: "stopped",
      messages: this.projector.snapshot().messages,
    };
    this.local = null;
    return this.snapshot();
  }

  acknowledgeFreeze(): void {
    this.pendingFreeze = null;
    this.liveAssistantId = null;
  }

  reset(): void {
    this.projector = new SessionProjector();
    this.local = null;
    this.liveAssistantId = null;
    this.pendingFreeze = null;
  }

  snapshot(): TurnView {
    return this.viewFrom(this.projector.snapshot());
  }

  private afterSnap(snap: ProjectedChat): TurnView {
    const busy = liveBusy(snap);
    if (this.local) {
      if (snap.running || busy) this.local.turned = true;
      if (!snap.running && this.local.turned && !this.local.cancelled) {
        this.pendingFreeze = {
          status: mapFreezeStatus(snap.status),
          error: snap.status || undefined,
          messages: snap.messages,
        };
        this.local = null;
      }
    } else if (snap.running && busy && !this.liveAssistantId) {
      this.liveAssistantId = `live-${Date.now()}`;
    }
    if (!snap.running && !this.pendingFreeze) this.liveAssistantId = null;
    return this.viewFrom(snap);
  }

  private viewFrom(snap: ProjectedChat): TurnView {
    const busy = liveBusy(snap);
    return {
      messages: snap.messages,
      running: snap.running,
      status: snap.status,
      liveMd: snap.liveMd,
      liveReason: snap.liveReason,
      liveTools: snap.liveTools,
      liveId: this.local?.id ?? (snap.running && busy ? this.liveAssistantId : null),
      pendingFreeze: this.pendingFreeze,
    };
  }
}
