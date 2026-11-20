/**
 * Client preferences the chat keeps between launches: which key sends.
 * `sendKey` is the store; a launch reads it back from the app's storage.
 */
import { platform, signal, Storage } from "nsh";

import { t } from "../../../lib/i18n";

/** Enter sends (Shift+Enter adds a line), or the platform's command key does. */
export type SendKey = "enter" | "mod-enter";

export const SEND_KEY_STORAGE = "dsh-bot.prefs.sendKey";

export function parseSendKey(raw: string | null | undefined): SendKey {
  return raw === "mod-enter" ? "mod-enter" : "enter";
}

/** "Return" or "⌘Return" / "Ctrl+Return", as the composer's hint says it. */
export function sendKeyLabel(key: SendKey): string {
  if (key === "enter") return t("chat.sendKey.return");
  // The command key itself is the platform's; "Return" is the key.
  return `${platform.os === "macos" || platform.os === "ios" ? "⌘" : "Ctrl+"}${t("chat.sendKey.return")}`;
}

export const sendKey = signal<SendKey>("enter");

let loaded = false;

export function setSendKey(next: SendKey): void {
  sendKey.set(next);
  void Storage.setItem(SEND_KEY_STORAGE, next).catch(() => undefined);
}

/** Reads the stored preference once; a failure keeps the default. */
export function ensurePreferences(): void {
  if (loaded) return;
  loaded = true;
  void Storage.getItem(SEND_KEY_STORAGE)
    .then((value) => sendKey.set(parseSendKey(value)))
    .catch(() => undefined);
}
