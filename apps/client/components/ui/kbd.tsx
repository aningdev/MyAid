// A keyboard key, alone or in a group of them, on `nsh`'s own View and Text. This library's own
// (upstream has no keycap, and no `nsh/base` control is its behavior): there is no port region.
// Yours to change.
import { colors, mono, TERMINAL_ROW, terminal } from "../../lib/theme";
import type { JSX, TextStyle, ViewProps, ViewStyle } from "nsh";
import { split, Text, token, View } from "nsh";

import { controlSize } from "../../lib/surface";

/** A key's look: the cap itself, the type on it, and a row of them. Spread each one. */
export interface KbdLook {
  /** The cap: one line high, at least as wide, a light fill and a hairline edge. */
  readonly kbd: ViewStyle;
  /** The key's name on the cap: small, medium, and a step quieter than the page's text. */
  readonly text: TextStyle;
  /** A row of keys, a gap apart (`⌘ K` as two caps). */
  readonly group: ViewStyle;
}

/** The side of a key: one line of small type with room above and below it. */
const side = 20;

/**
 * A key's look, after shadcn/ui's `Kbd`: one line high (20 points with a pointer, one Cell row in
 * the terminal), as wide as its name with a padding either side and at least a square, the theme's
 * small corners, a hairline edge and the `muted` fill, the name small (12 points), medium and in
 * the muted ink. The terminal draws no fill and no edge, its keys standing in the row as their
 * names in the monospaced face.
 */
export function kbdLook(): KbdLook {
  return {
    get kbd(): ViewStyle {
      return {
        height: terminal ? TERMINAL_ROW : side,
        minWidth: terminal ? undefined : side,
        paddingHorizontal: terminal ? 0 : 4,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        borderRadius: terminal ? 0 : controlSize.corner,
        borderWidth: terminal ? 0 : 1,
        borderColor: colors.line,
        backgroundColor: terminal ? "transparent" : token("muted"),
      };
    },
    get text(): TextStyle {
      return {
        fontSize: terminal ? 14 : 12,
        fontWeight: "500",
        color: colors.muted,
        ...(terminal ? { fontFamily: mono } : {}),
        numberOfLines: 1,
      };
    },
    get group(): ViewStyle {
      return {
        flexDirection: "row",
        alignItems: "center",
        gap: terminal ? 0 : 4,
        flexShrink: 0,
      };
    },
  };
}

/** A key's props: a string is its name, drawn in the look's type; anything else (an icon) is drawn as given. */
export type KbdProps = Omit<ViewProps, "children"> & {
  /** The key's name (`K`, `Esc`, `⌘`), or an icon. */
  children?: string | JSX.Element;
};

/** A row of keys: `⌘` and `K` as two caps, or one cap holding `Ctrl + B`. */
export type KbdGroupProps = ViewProps;

/**
 * A keyboard key, after shadcn/ui's: a small cap in the muted fill with a hairline edge, for the
 * stroke a shortcut takes. Every `nsh` view prop passes through; `style` goes over the look's. In
 * a terminal the key is its name in the monospaced face, with no cap around it.
 */
export function Kbd(props: KbdProps) {
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View {...rest} style={[kbdLook().kbd, props.style ?? null]}>
      {typeof props.children === "string" ? (
        <Text style={kbdLook().text}>{props.children}</Text>
      ) : (
        props.children
      )}
    </View>
  );
}

/** Keys side by side, a small gap apart: `⌘`, `⇧`, `K`. */
export function KbdGroup(props: KbdGroupProps) {
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View {...rest} style={[kbdLook().group, props.style ?? null]}>
      {props.children}
    </View>
  );
}
