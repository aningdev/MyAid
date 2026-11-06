import { signal, untracked } from "nsh";
import type { DockAreaLayout } from "nsh/base";

import {
  collectPanelIds,
  emptyLayout,
  normalizeCenter,
  removePanel,
  splitAroundPanel,
  withActivatedPanel,
} from "./dock";
import { navActionForId, spaceById } from "./fixtures";
import type { NavAddress, PanelContents } from "./types";

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

export function panelTitle(panelId: string): string {
  return panelContentsState()[panelId]?.title ?? "Empty";
}

function cloneLayout(layout: DockAreaLayout): DockAreaLayout {
  return JSON.parse(JSON.stringify(layout)) as DockAreaLayout;
}

function cloneContents(contents: PanelContents): PanelContents {
  return JSON.parse(JSON.stringify(contents)) as PanelContents;
}

export function openAddress(address: NavAddress) {
  const contents = untracked(panelContentsState);
  for (const [panelId, addr] of Object.entries(contents)) {
    if (addr?.id === address.id) {
      setActivePanel(panelId);
      return;
    }
  }
  const activeId = untracked(activePanelIdState);
  const ids = collectPanelIds(untracked(dockLayoutState).center);
  const target = ids.includes(activeId) ? activeId : ids[0];
  if (!target) return;
  panelContentsState.set({ ...contents, [target]: address });
  setActivePanel(target);
}

export function applySpace(spaceId: string) {
  const space = spaceById(spaceId);
  if (!space) return;
  dockLayoutState.set(cloneLayout(space.layout));
  panelContentsState.set(cloneContents(space.contents));
  activePanelIdState.set(space.activePanelId);
}

/** Tree onAction: open address or apply Space. */
export function activateNavItem(id: string) {
  const action = navActionForId(id);
  if (!action) return;
  if (action.type === "address") openAddress(action.address);
  else applySpace(action.spaceId);
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
}

/** Split a specific panel (used from PanelChrome). */
export function splitPanel(panelId: string, dir: SplitDirection) {
  setActivePanel(panelId);
  splitActivePanel(dir);
}

export function closePanel(panelId: string) {
  const layout = untracked(dockLayoutState);
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
    activePanelIdState.set(collectPanelIds(nextCenter)[0] ?? newId("panel"));
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
