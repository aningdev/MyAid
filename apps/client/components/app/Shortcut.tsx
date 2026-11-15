/**
 * A shortcut's stroke as its caps: `⌘` and `N` where the platform names the
 * stroke `⌘N`, `Ctrl` and `N` where it names it `Ctrl+N`. shadcn-nsh's `Kbd`
 * is one key and `KbdGroup` a row of them; naming a whole shortcut is ours.
 */
import { keymap, type ViewStyle } from "nsh";

import { Kbd, KbdGroup } from "../ui/kbd";

/** A key's name as `keymap.label` writes it, split into one name per cap. */
function keyCaps(label: string): string[] {
  // `Ctrl+Shift+P`: the names are joined by `+`.
  if (label.includes("+")) return label.split("+");
  // `⇧⌘L`: the modifiers are glyphs leading the key's own name.
  const modifiers = label.match(/^[⌘⇧⌥⌃]+/)?.[0] ?? "";
  const rest = label.slice(modifiers.length);
  return [...modifiers, ...(rest ? [rest] : [])];
}

export function Shortcut(props: { keystroke: string; style?: ViewStyle }) {
  return (
    <KbdGroup style={props.style}>
      {keyCaps(keymap.label(props.keystroke)).map((cap) => (
        <Kbd>{cap}</Kbd>
      ))}
    </KbdGroup>
  );
}
