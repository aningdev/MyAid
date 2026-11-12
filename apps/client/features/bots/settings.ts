/**
 * Bot Settings: which Bot the one sheet is for. The sheet itself is mounted
 * once by the shell, so the Bot Panel and the Inspector's Bot section open the
 * same surface; the Bot id is the truth, never a copy of the Bot.
 */
import { signal } from "nsh";

const editing = signal<string | null>(null);

/** The Bot the sheet is showing, or null while it is closed. */
export function botSettingsFor(): string | null {
  return editing();
}

export function openBotSettings(botId: string): void {
  editing.set(botId);
}

export function closeBotSettings(): void {
  editing.set(null);
}
