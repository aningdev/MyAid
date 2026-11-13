/**
 * Whether the Settings overlay covers the Panes. Its own module, with no UI
 * and no native imports, so the command table (and its unit test) can open it
 * without pulling the Settings page's control-channel chain into the bundle.
 */
import { signal } from "nsh";

const showing = signal(false);

export function settingsOpen(): boolean {
  return showing();
}

export function openSettings(): void {
  showing.set(true);
}

export function closeSettings(): void {
  showing.set(false);
}

export function toggleSettings(): void {
  showing.set(!showing());
}
