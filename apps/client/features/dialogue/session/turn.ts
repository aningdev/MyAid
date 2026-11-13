/**
 * Deep module: the official Session event window + local turn lifecycle →
 * Dialogue messages / live reply / freeze. `SessionProjector` stays the
 * window fold; freeze and "turned" races live here.
 */
import type { SessionEventWindow } from "@myaid/dsh-web-protocol/client";

import type { Msg, Status, Tool } from "../chat/scripts";
import { SessionProjector, type Deliverable, type ProjectedChat } from "./projector";

export type { Deliverable };

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
  /** The window does not reach the first event: older pages can be read. */
  olderHasMore: boolean;
  /** Files this Session declared as deliverables inside the loaded window. */
  deliverables: Deliverable[];
  /** When set, the pane should commit the live bubble then call acknowledgeFreeze(). */
  pendingFreeze: FreezeOutcome | null;
};

type LocalTurn = {
  id: string;
  /** The prompt's request id: its durable admission proves the turn started. */
  requestId: string | null;
  /** Window top when the prompt was sent, so a later `turn/start` also proves it. */
  baseSeq: number | null;
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

/**
 * The messages a finished turn commits: its durable page, plus the pane's
 * live reply only when that page does not hold it (a stopped or failed turn,
 * where dsh kept the user's message alone).
 */
export function freezeMessages(durable: readonly Msg[], live: Msg | null): Msg[] {
  if (!live) return [...durable];
  return durable[durable.length - 1]?.kind === "assistant" ? [...durable] : [...durable, live];
}

/** Owns the window fold + when a local prompt may freeze into history. */
export class TurnProjection {
  private projector = new SessionProjector();
  private local: LocalTurn | null = null;
  private liveAssistantId: string | null = null;
  private pendingFreeze: FreezeOutcome | null = null;
  private lastRunning = false;

  /** User sent a prompt; `assistantId` is the placeholder bubble id. */
  beginTurn(assistantId: string, requestId?: string): void {
    this.local = {
      id: assistantId,
      requestId: requestId ?? null,
      baseSeq: this.projector.lastSeq(),
      turned: false,
      cancelled: false,
    };
    this.liveAssistantId = assistantId;
    this.pendingFreeze = null;
  }

  /** Fold the official window; `running` is the Host-asserted turn state. */
  apply(window: SessionEventWindow, running: boolean): TurnView {
    this.projector.apply(window);
    this.lastRunning = running;
    return this.afterSnap(this.projector.snapshot(), running);
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
    return this.viewFrom(this.projector.snapshot(), this.lastRunning);
  }

  private afterSnap(snap: ProjectedChat, running: boolean): TurnView {
    const busy = liveBusy(snap);
    if (this.local) {
      if (running || busy || this.admitted(snap, this.local)) this.local.turned = true;
      if (!running && this.local.turned && !this.local.cancelled) {
        this.pendingFreeze = {
          status: mapFreezeStatus(snap.status),
          error: snap.status || undefined,
          messages: snap.messages,
        };
        this.local = null;
      }
    } else if (running && busy && !this.liveAssistantId) {
      this.liveAssistantId = `live-${Date.now()}`;
    }
    if (!running && !this.pendingFreeze) this.liveAssistantId = null;
    return this.viewFrom(snap, running);
  }

  /**
   * The turn started, whatever the pane saw: the log admitted this prompt
   * (`rpcId`), or a newer `turn/start` landed. A turn reported only by a
   * reconnected snapshot therefore settles too.
   */
  private admitted(snap: ProjectedChat, local: LocalTurn): boolean {
    if (local.requestId && this.projector.admitted(local.requestId)) return true;
    if (liveBusy(snap)) return true;
    return this.projector.turnStartedAfter(local.baseSeq);
  }

  private viewFrom(snap: ProjectedChat, running: boolean): TurnView {
    const busy = liveBusy(snap);
    return {
      messages: snap.messages,
      running,
      status: snap.status,
      liveMd: snap.liveMd,
      liveReason: snap.liveReason,
      liveTools: snap.liveTools,
      liveId: this.local?.id ?? (running && busy ? this.liveAssistantId : null),
      olderHasMore: snap.olderHasMore,
      deliverables: snap.deliverables,
      pendingFreeze: this.pendingFreeze,
    };
  }
}
