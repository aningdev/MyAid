/**
 * Bot details: which Bot the one modal is for. The modal is mounted once by
 * the app shell, so a Pane's header, the list's context menu and the palette
 * open the same surface; the Bot id is the truth, never a copy of the Bot.
 */
import { signal } from "nsh";

const editing = signal<string | null>(null);

/** The Bot the modal is showing, or null while it is closed. */
export function botDetailsFor(): string | null {
  return editing();
}

export function openBotDetails(botId: string): void {
  editing.set(botId);
}

export function closeBotDetails(): void {
  editing.set(null);
}
