/**
 * The Favorites section's pins: Navigator addresses a person keeps at the
 * top. They live in client preferences (prefs.ts reads and writes this
 * signal), not in the registry: they are a view of this computer, and the
 * address they name may outlive a Dialogue or a Session.
 */
import { signal, untracked } from "nsh";

import type { NavAddress } from "./types";

const pins = signal<NavAddress[]>([]);

/** The pinned addresses, in the person's order. */
export function favorites(): readonly NavAddress[] {
  return pins();
}

export function setFavorites(next: readonly NavAddress[]): void {
  const seen = new Set<string>();
  const unique: NavAddress[] = [];
  for (const address of next) {
    if (seen.has(address.id)) continue;
    seen.add(address.id);
    unique.push(address);
  }
  pins.set(unique);
}

export function isFavorite(addressId: string): boolean {
  return pins().some((address) => address.id === addressId);
}

/** Pin the address, or take it out when it is already pinned. */
export function toggleFavorite(address: NavAddress): boolean {
  const current = untracked(pins);
  if (current.some((pin) => pin.id === address.id)) {
    pins.set(current.filter((pin) => pin.id !== address.id));
    return false;
  }
  pins.set([...current, address]);
  return true;
}

export function removeFavorite(addressId: string): void {
  pins.set(untracked(pins).filter((address) => address.id !== addressId));
}
