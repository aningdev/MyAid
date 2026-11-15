/**
 * The New Bot dialog: one signal for who is showing it. The dialog itself is
 * mounted once by the shell, so the menu, the palette, the Bots section's
 * `+` and the welcome state open the same surface.
 */
import { signal } from "nsh";

const showing = signal(false);

export function newBotOpen(): boolean {
  return showing();
}

export function openNewBot(): void {
  showing.set(true);
}

export function closeNewBot(): void {
  showing.set(false);
}
