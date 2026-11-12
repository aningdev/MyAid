/**
 * The Navigator's search field: its query, and a request to take the
 * keyboard there (⌘F, the View menu). The Navigator reads both; the command
 * table asks without touching the tree.
 */
import { signal, untracked } from "nsh";

import { navOpen, setNavOpen } from "./layout";

const query = signal("");
const focusRequest = signal(0);

export function navQuery(): string {
  return query();
}

export function setNavQuery(next: string): void {
  query.set(next);
}

export function clearNavQuery(): void {
  query.set("");
}

/** Focus the Navigator's search field, expanding the Navigator if it is closed. */
export function requestNavSearchFocus(): void {
  if (!navOpen()) setNavOpen(true);
  focusRequest.update((value) => value + 1);
}

/** The rung of the focus request; the Navigator focuses on each new value. */
export function navSearchFocusRequest(): number {
  return focusRequest();
}

/** Let the Navigator see that no more focus was asked for (it focused once). */
export function takeNavSearchFocus(): boolean {
  const current = untracked(focusRequest);
  if (current === 0) return false;
  focusRequest.set(0);
  return true;
}
