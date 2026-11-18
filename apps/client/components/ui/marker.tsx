// A marker: one line in a conversation that is not a message — a status, a note, a row with a
// rule under it, or a label between two rules. This library's own (drawn on `nsh`'s View and
// Text), so there is no port region. Yours to change.
import { colors, TERMINAL_COLUMN, TERMINAL_ROW, terminal } from "../../lib/theme";
import type { IconNode } from "lucide";
import type { JSX, TextProps, TextStyle, ViewProps, ViewStyle } from "nsh";
import { context, platform, split, Text, View } from "nsh";

import { Icon } from "../../lib/icons";
import { density } from "../../lib/surface";

/** A marker's layout: `default`, an inline line; `border`, the same line with a rule under it
 * (a row boundary); `separator`, the label between two rules (a date, a section break). */
export type MarkerVariant = "default" | "border" | "separator";

/** A marker's icon box: 16 points, a step below the line's type (shadcn/ui's `size-4`). */
const iconSide = 16;

/** The gap between a marker's parts: 8 points, half a Cell in a terminal. */
const gap = terminal ? TERMINAL_COLUMN / 2 : 8;

/** The room a bordered marker keeps under its line, above the rule. */
const borderPad = terminal ? 0 : 8;

/** What a `MarkerContent` under a `Marker` wears: the layout, and whether the marker acts (its
 * line underlined, as shadcn/ui's link marker is). */
const MarkerContext = context<{
  variant: () => MarkerVariant;
  interactive: () => boolean;
} | null>(null);

/** A marker's parts as the styles they wear: spread each one onto the part that matches its name. */
export interface MarkerLook {
  /** The root (`Marker`): a row of its parts, at least one line tall, as wide as its column. A
   * `border` marker keeps 8 points under the line and closes it with a hairline; a `separator`
   * one has the rule on each side of what it holds. */
  root(variant: MarkerVariant): ViewStyle;
  /** A separator's rule: a hairline that takes the room left on its side, in the border's color. */
  readonly rule: ViewStyle;
  /** The icon's box (`MarkerIcon`): a square that centers its icon, never shrunk by a tight row. */
  readonly icon: ViewStyle;
  /** The content's type (`MarkerContent`): the muted ink, the body's size. A separator's label
   * takes its own width and is centered instead of filling the row. */
  content(variant: MarkerVariant): TextStyle;
  /** A marker that acts (`onPress`): the pointer over it is a hand. */
  readonly pressable: ViewStyle;
  /** What a marker's icon is drawn with: 16 points, in the muted ink. */
  readonly glyph: { size: number; tint: string };
}

/**
 * A marker's look, after shadcn/ui's: a row 8 points apart, at least 16 points tall, in the
 * muted ink at the body's size, its icon 16 points. `border` adds 8 points under the line and a
 * hairline across it; `separator` puts a hairline either side of the label, each taking the room
 * left. The terminal keeps the line's type and draws the rules as hairlines too.
 */
export function markerLook(): MarkerLook {
  return {
    root: (variant: MarkerVariant): ViewStyle => ({
      flexDirection: "row",
      alignItems: "center",
      gap,
      width: "100%",
      minWidth: 0,
      minHeight: terminal ? TERMINAL_ROW : iconSide,
      ...(variant === "border"
        ? {
            paddingBottom: borderPad,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }
        : {}),
    }),
    get rule(): ViewStyle {
      return {
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        minWidth: 0,
        height: 1,
        backgroundColor: colors.border,
      };
    },
    get icon(): ViewStyle {
      return {
        width: iconSide,
        height: iconSide,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      };
    },
    content: (variant: MarkerVariant): TextStyle => ({
      fontSize: density.body,
      color: colors.muted,
      flexShrink: variant === "separator" ? 0 : 1,
      minWidth: 0,
      ...(variant === "separator" ? { textAlign: "center" } : {}),
    }),
    get pressable(): ViewStyle {
      return { cursor: platform.desktop ? "pointer" : undefined };
    },
    get glyph() {
      return { size: iconSide, tint: colors.muted };
    },
  };
}

/**
 * A marker's props. Every `nsh` view prop passes through (`role`, `onPress`), and `style` goes
 * over the look's.
 */
export type MarkerProps = ViewProps & {
  /** Default `default`. See `MarkerVariant`. */
  variant?: MarkerVariant;
};

/** An icon's box beside the line. `icon` is drawn in the muted ink at 16 points; anything else
 * (`children`) is drawn as given. */
export type MarkerIconProps = Omit<ViewProps, "children"> & {
  /** The icon, as lucide exports it (`import { Search } from "lucide"`). */
  icon?: IconNode;
  /** Drawn instead of `icon`, as given. */
  children?: JSX.Element;
};

/** A marker's line. A string is drawn in the look's type; anything else is drawn as given. */
export type MarkerContentProps = Omit<TextProps, "children"> & {
  /** The line: a word, a sentence, a link's label. */
  children?: string | JSX.Element;
};

/**
 * A marker, after shadcn/ui's: a status, a system note or a step of a run, as one muted line an
 * icon can lead. `variant="border"` closes the line with a hairline under it (a row boundary);
 * `variant="separator"` puts a hairline either side of it (a date, a compaction, a section).
 * Build it from `MarkerIcon` and `MarkerContent`, in either order. Setting `role="status"` has a
 * streaming marker announced as it changes; give it `onPress` (with `role="button"`) for one that
 * acts, where shadcn/ui's `asChild` would take a link or a button.
 */
export function Marker(props: MarkerProps) {
  const variant = () => props.variant ?? "default";
  const interactive = () => props.onPress !== undefined;
  const [, rest] = split(props, ["variant", "children", "style"]);
  return (
    <MarkerContext.Provider value={{ variant, interactive }}>
      <View
        {...rest}
        style={[
          markerLook().root(variant()),
          interactive() ? markerLook().pressable : null,
          props.style ?? null,
        ]}
      >
        <If when={variant() === "separator"}>
          <View style={markerLook().rule} />
        </If>
        {typeof props.children === "string" ? (
          <Text style={markerLook().content(variant())}>{props.children}</Text>
        ) : (
          props.children
        )}
        <If when={variant() === "separator"}>
          <View style={markerLook().rule} />
        </If>
      </View>
    </MarkerContext.Provider>
  );
}

/** An icon beside a marker's line. Decorative: what screen readers get is `MarkerContent`. */
export function MarkerIcon(props: MarkerIconProps) {
  const [, rest] = split(props, ["icon", "children", "style"]);
  return (
    <View {...rest} style={[markerLook().icon, props.style ?? null]}>
      {props.icon ? <Icon icon={props.icon} {...markerLook().glyph} /> : props.children}
    </View>
  );
}

/** The line of a marker. */
export function MarkerContent(props: MarkerContentProps) {
  // Outside a `Marker` the line stands alone: the default layout, and no underline.
  const inherited = MarkerContext();
  const variant = (): MarkerVariant => (inherited ? inherited.variant() : "default");
  const interactive = () => (inherited ? inherited.interactive() : false);
  const [, rest] = split(props, ["children", "style"]);
  return (
    <Text
      {...rest}
      style={[
        markerLook().content(variant()),
        interactive() ? { textDecorationLine: "underline" } : null,
        props.style ?? null,
      ]}
    >
      {props.children}
    </Text>
  );
}
