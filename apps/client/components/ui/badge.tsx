// A small capsule label. From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import {
  colors,
  radius,
  terminal,
  TERMINAL_ROW,
  toneColor,
  toneTint,
  type Tone,
} from "../../lib/theme";
import { token, View, Text } from "nsh";

/** A badge's variants: `default`, the tone's fill; `outline`, an edge in the tone's color. */
export type BadgeVariant = "default" | "outline";

/** A value, or a function reading it where the badge is drawn (a signal). */
type Live<T> = T | (() => T);

const read = <T,>(v: Live<T> | undefined): T | undefined =>
  typeof v === "function" ? (v as () => T)() : v;

/** The props of `Badge`. */
export type BadgeProps = {
  /** The label: a word, a state, a count. */
  children: string;
  /** The tone of the word and its fill, `neutral` unless set; a function is read where the badge is drawn. */
  tone?: Tone | (() => Tone);
  /** `default`: the tone's fill; `outline`: an edge in the tone's color under the word. */
  variant?: BadgeVariant;
};

/**
 * A small label in a capsule (a word on its row in the terminal), after
 * shadcn/ui's secondary badge: 20 points tall, flat, no shadow; a neutral
 * badge on the theme's `muted` fill in the text color, a toned one on its
 * tone's tint in the tone's color, and as `variant="outline"` an edge in
 * the tone's color. The children are the label; `tone` is read where it is
 * drawn, so a function follows a value the app changes.
 */
export function Badge(props: BadgeProps) {
  const tone = () => read(props.tone) ?? "neutral";
  const outline = props.variant === "outline";
  return (
    <View
      style={{
        paddingHorizontal: terminal ? 0 : 8,
        height: terminal ? TERMINAL_ROW : 20,
        borderRadius: radius.inset,
        justifyContent: "center",
        backgroundColor: outline
          ? "transparent"
          : tone() === "neutral"
            ? token("muted")
            : toneTint(tone()),
        borderWidth: outline ? 1 : 0,
        borderColor: outline ? toneColor(tone()) : undefined,
        // A change of tone (a window turning active) crosses over.
        transitionProperty: "colors",
        transitionDuration: 160,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: "500",
          color: tone() === "neutral" ? colors.text : toneColor(tone()),
          numberOfLines: 1,
          fontVariant: ["tabular-nums"],
        }}
      >
        {props.children}
      </Text>
    </View>
  );
}
