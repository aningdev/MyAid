/**
 * Attention outside the window: a reply that lands or an approval that waits
 * in a Session the person is not looking at becomes a system notification,
 * and the Dock / taskbar badge counts the Sessions that need them. The
 * decision is a pure function over two roster snapshots, so it is testable
 * without a system notification.
 *
 * A Session is "watched" when the main window has the keyboard focus and its
 * Panel is the active one; anything else (another Panel, another app, a
 * minimized window) may notify.
 */
import { effect, Notifications, platform, untracked } from "nsh";
import { Window } from "nsh/desktop";

import { claimOwner } from "../../features/bots/model";
import { sessionLabel } from "../../features/bots/sessions";
import { registry } from "../../features/bots/state";
import { sessionList, type SessionRow } from "../../features/dialogue/session/runtime";
import { isSessionArchived, workspaces } from "../../features/workspace/state";
import { sessionAddress } from "./navAddresses";
import { activeAddress, openAddress } from "./state";

/** The notification id prefix; the rest is the Session id a press opens. */
export const NOTIFICATION_PREFIX = "myaid.session.";

export type AttentionKind = "reply" | "approval";

export type AttentionStatus = {
  running: boolean;
  unread: boolean;
  attention: boolean;
};

export type AttentionEvent = {
  sessionId: string;
  kind: AttentionKind;
};

/** The rows' live marks, for the next comparison. */
export function attentionStatuses(rows: readonly SessionRow[]): Map<string, AttentionStatus> {
  return new Map(
    rows.map((row) => [
      row.id,
      { running: row.running, unread: row.unread, attention: row.attention },
    ]),
  );
}

/**
 * What became worth a notification between two rosters. A Session in front
 * of a focused window is watched and stays quiet; an approval outranks the
 * reply that may have finished in the same tick.
 */
export function attentionEvents(
  previous: ReadonlyMap<string, AttentionStatus>,
  rows: readonly SessionRow[],
  watch: { focused: boolean; visibleSessionId: string | null },
): AttentionEvent[] {
  const events: AttentionEvent[] = [];
  for (const row of rows) {
    if (watch.focused && row.id === watch.visibleSessionId) continue;
    const before = previous.get(row.id);
    const approval = !before?.attention && row.attention;
    const reply = (!!before?.running && !row.running) || (!before?.unread && row.unread);
    if (approval) events.push({ sessionId: row.id, kind: "approval" });
    else if (reply) events.push({ sessionId: row.id, kind: "reply" });
  }
  return events;
}

/** How many Sessions wait on the person (unread replies and approvals). */
export function attentionCount(rows: readonly SessionRow[]): number {
  return rows.filter((row) => row.unread || row.attention).length;
}

/** What a notification says: the Bot's name over the Session and the reason. */
export function notificationText(
  row: Pick<SessionRow, "botName" | "label">,
  kind: AttentionKind,
): { title: string; body: string } {
  return {
    title: row.botName || "MyAid",
    body: kind === "approval" ? `${row.label} is waiting for approval` : `${row.label} replied`,
  };
}

/** The Session a notification id names. */
export function sessionFromNotification(id: string): string | null {
  if (!id.startsWith(NOTIFICATION_PREFIX)) return null;
  const sessionId = id.slice(NOTIFICATION_PREFIX.length);
  return sessionId || null;
}

function focused(): boolean {
  const state = Window.get("main")?.state();
  // No platform state yet (headless, a window coming up): assume the person
  // is here, so a startup never fires notifications for old replies.
  return state ? state.focused : true;
}

function visibleSessionId(): string | null {
  const address = activeAddress();
  return address?.kind === "session" ? (address.sessionId ?? null) : null;
}

function openFromNotification(id: string): void {
  const sessionId = sessionFromNotification(id);
  if (!sessionId) return;
  const owner = claimOwner(untracked(registry), sessionId);
  if (!owner || isSessionArchived(untracked(workspaces), sessionId)) return;
  openAddress(
    sessionAddress({
      sessionId,
      label: sessionLabel(owner.claim, null),
      botId: owner.bot.id,
      dialogueId: owner.dialogue.id,
    }),
  );
  Window.get("main")?.focus();
}

/**
 * Watch the roster for the whole run. Called once by the shell; on platforms
 * without the notification capability it does nothing.
 */
export function startAttention(): void {
  if (platform.idiom !== "desktop" || platform.os === "web") return;

  let previous = new Map<string, AttentionStatus>();
  let seeded = false;
  let permissionAsked = false;
  let lastBadge = -1;

  try {
    Notifications.on("press", ({ id }) => openFromNotification(id));
  } catch {
    // The capability is not granted: notifications stay unavailable.
  }

  effect(() => {
    const list = sessionList();
    if (!seeded) {
      seeded = true;
      previous = attentionStatuses(list);
      void updateBadge(attentionCount(list), lastBadge, (count) => (lastBadge = count));
      return;
    }
    const events = attentionEvents(previous, list, {
      focused: focused(),
      visibleSessionId: visibleSessionId(),
    });
    previous = attentionStatuses(list);
    void updateBadge(attentionCount(list), lastBadge, (count) => (lastBadge = count));
    if (events.length === 0) return;
    const pending = events.flatMap((event) => {
      const row = list.find((item) => item.id === event.sessionId);
      return row ? [{ event, row }] : [];
    });
    void notify(
      pending,
      () => !permissionAsked,
      () => (permissionAsked = true),
    );
  });
}

/** Ask once, then show what is due; a permission prompt comes before the first banner. */
async function notify(
  pending: { event: AttentionEvent; row: SessionRow }[],
  firstAsk: () => boolean,
  markAsked: () => void,
): Promise<void> {
  if (firstAsk()) {
    markAsked();
    await Notifications.requestPermission().catch(() => undefined);
  }
  for (const { event, row } of pending) {
    const text = notificationText(row, event.kind);
    await Notifications.show({
      id: `${NOTIFICATION_PREFIX}${event.sessionId}`,
      title: text.title,
      body: text.body,
    }).catch(() => undefined);
  }
}

async function updateBadge(
  count: number,
  last: number,
  remember: (count: number) => void,
): Promise<void> {
  if (count === last) return;
  remember(count);
  try {
    await Notifications.setBadge(count);
  } catch {
    // No capability, or no badge on this platform.
  }
}
