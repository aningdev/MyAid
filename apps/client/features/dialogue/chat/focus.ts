/**
 * "Focus the composer": a request the chat consumes when it shows. The
 * command table and the new-Bot flow ask for it; the Composer of that
 * Session takes the keyboard, whether it is already mounted or mounts
 * after the request (a just-created Session).
 */
import { signal, untracked } from "nsh";

type FocusRequest = { sessionId: string; nonce: number };

const request = signal<FocusRequest | null>(null);
let nonce = 0;

/** Ask the composer of `sessionId` to take the keyboard. */
export function requestComposerFocus(sessionId: string): void {
  nonce += 1;
  request.set({ sessionId, nonce });
}

/** The pending request, without subscribing (the Composer's effect does). */
export function peekComposerFocus(): FocusRequest | null {
  return untracked(request);
}

/** Take the request for this Session, if it is for it: the Composer focuses once. */
export function takeComposerFocus(sessionId: string): boolean {
  const pending = untracked(request);
  if (!pending || pending.sessionId !== sessionId) return false;
  request.set(null);
  return true;
}

/** Drop a request (a Panel closed before the composer mounted). */
export function clearComposerFocus(): void {
  request.set(null);
}

/** The reactive accessor, for tests and the Composer's effect. */
export function composerFocusRequest(): FocusRequest | null {
  return request();
}
