/**
 * The Workbench's Panes: which Bot each shows, which one has the focus, and
 * the layout they tile in. One Bot lives in one Pane — opening it again only
 * moves the focus — and no Pane has tabs.
 */
import { signal, untracked } from "nsh";
import type { DockAreaLayout } from "nsh/base";

import { registry } from "../../features/bots/state";
import {
  collectPanelIds,
  emptyLayout,
  normalizeCenter,
  removePanel,
  splitAroundPanel,
  withActivatedPanel,
} from "./dock";
import type { PanelContents } from "./types";

let nextId = 1;
function newId(prefix: string): string {
  nextId += 1;
  return `${prefix}-${nextId}`;
}

const INITIAL_PANEL = "panel-1";

const activePanelIdState = signal(INITIAL_PANEL);
const dockLayoutState = signal<DockAreaLayout>(emptyLayout(INITIAL_PANEL));
const panelContentsState = signal<PanelContents>({ [INITIAL_PANEL]: null });

export function activePanelId() {
  return activePanelIdState();
}

export function setActivePanel(id: string) {
  activePanelIdState.set(id);
  dockLayoutState.set(withActivatedPanel(untracked(dockLayoutState), id));
}

export function dockLayout() {
  return dockLayoutState();
}

export function setDockLayout(next: DockAreaLayout) {
  dockLayoutState.set(next);
  const ids = collectPanelIds(next.center);
  if (ids.length > 0 && !ids.includes(untracked(activePanelIdState))) {
    activePanelIdState.set(ids[0]);
  }
}

export function panelContents() {
  return panelContentsState();
}

/** The Bot a Pane shows, or null for an empty slot or a vanished Bot. */
export function panelBotId(panelId: string): string | null {
  return panelContentsState()[panelId]?.botId ?? null;
}

/** A Pane's title: its Bot's current name, or "Empty". */
export function panelTitle(panelId: string): string {
  const botId = panelBotId(panelId);
  if (!botId) return "Empty";
  return registry().bots.find((bot) => bot.id === botId)?.name ?? "Empty";
}

/** The Pane showing `botId`, if one does. */
export function panelForBot(botId: string): string | null {
  for (const [panelId, content] of Object.entries(panelContentsState())) {
    if (content?.botId === botId) return panelId;
  }
  return null;
}

/** Points one Pane at a Bot (null empties it). */
export function setPanelBot(panelId: string, botId: string | null) {
  const contents = untracked(panelContentsState);
  if (!(panelId in contents)) return;
  panelContentsState.set({ ...contents, [panelId]: botId ? { botId } : null });
}

/**
 * Opens a Bot: an open Pane comes to the front; otherwise the active Pane
 * shows it. This is the single entry point for the list, the palette, a
 * notification and a drop.
 */
export function openBot(botId: string) {
  const open = panelForBot(botId);
  if (open) {
    setActivePanel(open);
    return;
  }
  const contents = untracked(panelContentsState);
  const activeId = untracked(activePanelIdState);
  const ids = collectPanelIds(untracked(dockLayoutState).center);
  const target = ids.includes(activeId) ? activeId : ids[0];
  if (!target) return;
  panelContentsState.set({ ...contents, [target]: { botId } });
  setActivePanel(target);
}

export type SplitDirection = "right" | "down";

export function splitActivePanel(dir: SplitDirection) {
  const layout = untracked(dockLayoutState);
  const activeId = untracked(activePanelIdState);
  const newPanelId = newId("panel");
  const axis = dir === "right" ? "horizontal" : "vertical";
  const center = splitAroundPanel(layout.center, activeId, newPanelId, axis);
  dockLayoutState.set({ ...layout, center });
  panelContentsState.set({ ...untracked(panelContentsState), [newPanelId]: null });
  activePanelIdState.set(newPanelId);
  dockLayoutState.set(withActivatedPanel(untracked(dockLayoutState), newPanelId));
  return newPanelId;
}

/** Split a specific Pane (used from PanelChrome). */
export function splitPanel(panelId: string, dir: SplitDirection) {
  setActivePanel(panelId);
  return splitActivePanel(dir);
}

/**
 * A Bot dragged from the list into the Workbench: its Pane comes to the front
 * when it already has one, else it takes a new Pane beside the active one
 * (the empty slot first, so a fresh window does not split for nothing).
 */
export function dropBot(botId: string) {
  const open = panelForBot(botId);
  if (open) {
    setActivePanel(open);
    return;
  }
  if (untracked(panelContentsState)[untracked(activePanelIdState)] === null) {
    openBot(botId);
    return;
  }
  const panelId = splitActivePanel("right");
  setPanelBot(panelId, botId);
}

/** Closes the active Pane; the last one stays (no-op), as does an unknown one. */
export function closeActivePanel() {
  const layout = untracked(dockLayoutState);
  const ids = collectPanelIds(layout.center);
  const activeId = untracked(activePanelIdState);
  if (ids.length <= 1 || !ids.includes(activeId)) return;
  closePanel(activeId);
}

/** Moves the focus `step` Panes along the Workbench's Panes (wrapping). */
export function focusPanel(step: number) {
  const ids = collectPanelIds(untracked(dockLayoutState).center);
  if (ids.length < 2) return;
  const at = ids.indexOf(untracked(activePanelIdState));
  const next = ids[((((at < 0 ? 0 : at) + step) % ids.length) + ids.length) % ids.length];
  if (next) setActivePanel(next);
}

export function closePanel(panelId: string) {
  const layout = untracked(dockLayoutState);
  const order = collectPanelIds(layout.center);
  const at = order.indexOf(panelId);
  const nextCenter = normalizeCenter(removePanel(layout.center, panelId));
  const contents = { ...untracked(panelContentsState) };
  delete contents[panelId];

  if (nextCenter === null) {
    const emptyId = newId("panel");
    dockLayoutState.set(emptyLayout(emptyId));
    panelContentsState.set({ [emptyId]: null });
    activePanelIdState.set(emptyId);
    return;
  }

  dockLayoutState.set({ ...layout, center: nextCenter });
  panelContentsState.set(contents);
  if (untracked(activePanelIdState) === panelId) {
    // The Pane after the closed one, else the one before it (never the far end).
    const remaining = collectPanelIds(nextCenter);
    const next = order.slice(Math.max(0, at + 1)).find((id) => remaining.includes(id));
    const previous = order
      .slice(0, Math.max(0, at))
      .reverse()
      .find((id) => remaining.includes(id));
    activePanelIdState.set(next ?? previous ?? remaining[0] ?? newId("panel"));
  }
}

export function onPanelActiveChange(panelId: string, active: boolean) {
  if (active) activePanelIdState.set(panelId);
}

export function onPanelRemove(panelId: string) {
  const contents = { ...untracked(panelContentsState) };
  if (!(panelId in contents)) return;
  delete contents[panelId];
  if (Object.keys(contents).length === 0) {
    const emptyId = newId("panel");
    dockLayoutState.set(emptyLayout(emptyId));
    panelContentsState.set({ [emptyId]: null });
    activePanelIdState.set(emptyId);
    return;
  }
  panelContentsState.set(contents);
  if (untracked(activePanelIdState) === panelId) {
    activePanelIdState.set(Object.keys(contents)[0]);
  }
}

/** Replace the Workbench's Panes, contents and active Pane in one step (a restore). */
export function applyWorkbench(
  layout: DockAreaLayout,
  contents: PanelContents,
  active: string,
): void {
  const ids = collectPanelIds(layout.center);
  if (ids.length === 0) {
    const emptyId = newId("panel");
    dockLayoutState.set(emptyLayout(emptyId));
    panelContentsState.set({ [emptyId]: null });
    activePanelIdState.set(emptyId);
    return;
  }
  dockLayoutState.set(layout);
  const kept: PanelContents = {};
  for (const id of ids) kept[id] = contents[id] ?? null;
  panelContentsState.set(kept);
  activePanelIdState.set(ids.includes(active) ? active : ids[0]!);
  dockLayoutState.set(
    withActivatedPanel(untracked(dockLayoutState), untracked(activePanelIdState)),
  );
}

/** The Bot of the Pane with the focus, or null. */
export function activeBotId(): string | null {
  return panelBotId(activePanelId());
}
