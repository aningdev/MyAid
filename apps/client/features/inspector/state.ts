/**
 * Inspector per Panel: open or closed and its width. Both live for the run
 * only (nothing is written), keyed by the Panel's id, so two Panels on one
 * Session can differ. The Inspector belongs to a Panel, not to a Session.
 */
import { signal, untracked } from "nsh";

import { activePanelId } from "../../components/shell/state";

/** macOS inspector range: narrow enough to stay beside a chat, wide enough for paths. */
export const INSPECTOR_MIN_WIDTH = 268;
export const INSPECTOR_MAX_WIDTH = 320;
export const INSPECTOR_WIDTH = 288;

const open = signal<Readonly<Record<string, boolean>>>({});
const widths = signal<Readonly<Record<string, number>>>({});

export function inspectorOpen(panelId: string): boolean {
  return open()[panelId] === true;
}

export function inspectorWidth(panelId: string): number {
  return widths()[panelId] ?? INSPECTOR_WIDTH;
}

export function setInspectorWidth(panelId: string, width: number): void {
  const clamped = Math.round(Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, width)));
  if (inspectorWidth(panelId) === clamped) return;
  widths.set({ ...untracked(widths), [panelId]: clamped });
}

export function setInspectorOpen(panelId: string, next: boolean): void {
  if (inspectorOpen(panelId) === next) return;
  open.set({ ...untracked(open), [panelId]: next });
}

export function toggleInspector(panelId: string): void {
  setInspectorOpen(panelId, !inspectorOpen(panelId));
}

/** ⌥⌘I: the active Panel's Inspector. */
export function toggleInspectorOfActivePanel(): void {
  toggleInspector(untracked(activePanelId));
}
