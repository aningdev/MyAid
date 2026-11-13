/**
 * Pinned Bots: the one group at the top of the Navigator. They live in client
 * preferences (prefs.ts reads and writes this signal), not in the registry:
 * a pin is a view of this computer. It replaced Favorites, whose Session pins
 * are dropped — a Session is a segment of a Bot's conversation now, not a
 * place of its own.
 */
import { signal, untracked } from "nsh";

const pinned = signal<string[]>([]);

/** The pinned Bot ids, in the person's order. */
export function pins(): readonly string[] {
  return pinned();
}

export function setPins(next: readonly string[]): void {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const id of next) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  pinned.set(unique);
}

export function isPinned(botId: string): boolean {
  return pinned().includes(botId);
}

/** Pin the Bot at the end of the group, or take it out when already pinned. */
export function togglePin(botId: string): boolean {
  const current = untracked(pinned);
  if (current.includes(botId)) {
    pinned.set(current.filter((id) => id !== botId));
    return false;
  }
  pinned.set([...current, botId]);
  return true;
}
