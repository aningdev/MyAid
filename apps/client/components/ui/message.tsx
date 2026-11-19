// A message: one row of a conversation — its avatar, who sent it, the turn itself, and what is
// under it. This library's own (drawn on `nsh`'s View and Text, the avatar on `Avatar`), so there
// is no port region. Yours to change.
import { colors } from "../../lib/theme";
import type { JSX, TextStyle, ViewProps, ViewStyle } from "nsh";
import { context, platform, split, Text, View } from "nsh";

import { Avatar, type AvatarProps } from "./avatar";
import { density } from "../../lib/surface";

/** Which side of the conversation a message sits on: `start` (what came in), `end` (what you send). */
export type MessageAlign = "start" | "end";

/** The side of a message's avatar: 32 points, shadcn/ui's `size-8`. */
const avatarSide = platform.desktop ? 32 : 36;

/** The gap between a message's avatar and its content: 8 points. */
const gap = 8;

/** The room a message's header and footer keep from the turn's edge, and their gap. */
const noteInset = 12;
const noteGap = 6;

/** A header or a footer: one line of words, at the start of the row or on the message's side. */
const noteRow = (align: MessageAlign): ViewStyle => ({
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "stretch",
  justifyContent: align === "end" ? "flex-end" : "flex-start",
  gap: noteGap,
  paddingHorizontal: noteInset,
  minWidth: 0,
});

/** The small, medium, muted type of a header or a footer. */
const noteType = (): TextStyle => ({
  fontSize: density.note,
  fontWeight: "500",
  color: colors.muted,
});

/** What a `MessageContent` and a `MessageFooter` under a `Message` wear: the side. */
const MessageContext = context<(() => MessageAlign) | null>(null);

/** A message's parts as the styles they wear: spread each one onto the part that matches its name. */
export interface MessageLook {
  /** A group of messages from one sender (`MessageGroup`): a column 8 points apart. */
  readonly group: ViewStyle;
  /** The row (`Message`): its avatar and its content 8 points apart, on `align`'s side of the
   * column. */
  row(align: MessageAlign): ViewStyle;
  /** The avatar's box (`MessageAvatar`): a round 32-point identity (36 on a touch screen), at the
   * bottom of the row, beside the turn rather than its header. */
  readonly avatar: ViewStyle;
  /** The content's column (`MessageContent`): what the message holds, 10 points apart, on the
   * message's side. */
  content(align: MessageAlign): ViewStyle;
  /** Who sent it (`MessageHeader`): small and medium in the muted ink, 12 points in from the turn's
   * edge, always at the start of the row. */
  readonly header: ViewStyle;
  /** Its type. */
  readonly headerText: TextStyle;
  /** What is under the turn (`MessageFooter`): a row 12 points in from its edge, small and medium
   * in the muted ink, on the message's side. */
  footer(align: MessageAlign): ViewStyle;
  /** Its type. */
  readonly footerText: TextStyle;
}

/**
 * A message's look, after shadcn/ui's: a full-width row, its avatar 32 points round at the bottom
 * and its content a column 10 points apart, mirrored when the message is at the end. The header is
 * small and medium in the muted ink at the start of the row; the footer the same, at the message's
 * side, and it holds actions or a status. In a terminal the row is its lines, and the avatar draws
 * its initials in a Cell.
 */
export function messageLook(): MessageLook {
  return {
    get group(): ViewStyle {
      return { flexDirection: "column", gap: 8, minWidth: 0, width: "100%" };
    },
    row: (align: MessageAlign): ViewStyle => ({
      flexDirection: align === "end" ? "row-reverse" : "row",
      alignItems: "flex-end",
      gap,
      width: "100%",
      minWidth: 0,
    }),
    get avatar(): ViewStyle {
      return {
        width: avatarSide,
        height: avatarSide,
        borderRadius: avatarSide / 2,
        backgroundColor: colors.mutedFill,
        alignSelf: "flex-end",
        flexShrink: 0,
      };
    },
    content: (align: MessageAlign): ViewStyle => ({
      flexDirection: "column",
      alignItems: align === "end" ? "flex-end" : "flex-start",
      gap: 10,
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
    }),
    get header(): ViewStyle {
      return noteRow("start");
    },
    get headerText(): TextStyle {
      return noteType();
    },
    footer: (align: MessageAlign): ViewStyle => noteRow(align),
    get footerText(): TextStyle {
      return noteType();
    },
  };
}

/** A group of messages from one sender. Every `nsh` view prop passes through. */
export type MessageGroupProps = ViewProps;

/**
 * A message's props. Every `nsh` view prop passes through; `style` goes over the look's.
 * `align="end"` mirrors the row for what you sent.
 */
export type MessageProps = ViewProps & {
  /** Default `start`. */
  align?: MessageAlign;
};

/**
 * A message's avatar: this library's `Avatar`, so `name` gives it initials and a hue of their own
 * and `src` a picture. It is 32 points (36 on a touch screen) and round.
 */
export type MessageAvatarProps = Omit<AvatarProps, "children">;

/** What a message holds: a header, the turn (`Bubble`), and a footer. */
export type MessageContentProps = ViewProps;

/** Who sent it: a name, a status, a time. A string is drawn in the look's type; anything else is
 * drawn as given. */
export type MessageHeaderProps = Omit<ViewProps, "children"> & {
  /** The line: a sender's name. */
  children?: string | JSX.Element;
};

/** What is under the turn: a delivery status, or actions. A string is drawn in the look's type;
 * anything else (a row of buttons) is drawn as given. */
export type MessageFooterProps = Omit<ViewProps, "children"> & {
  /** The line or the actions. */
  children?: string | JSX.Element;
};

/**
 * One message of a conversation, after shadcn/ui's: the row that holds an avatar, who sent it,
 * the turn, and what is under it. What the turn looks like is `Bubble`'s; this owns the layout.
 * `align="end"` mirrors the row for what you sent.
 */
export function Message(props: MessageProps) {
  const align = () => props.align ?? "start";
  const [, rest] = split(props, ["align", "children", "style"]);
  return (
    <MessageContext.Provider value={align}>
      <View {...rest} style={[messageLook().row(align()), props.style ?? null]}>
        {props.children}
      </View>
    </MessageContext.Provider>
  );
}

/** Messages from one sender, one under another, 8 points apart. */
export function MessageGroup(props: MessageGroupProps) {
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View {...rest} style={[messageLook().group, props.style ?? null]}>
      {props.children}
    </View>
  );
}

/** The sender's avatar, at the bottom of the row. Compose the conversation itself in `Bubble`. */
export function MessageAvatar(props: MessageAvatarProps) {
  const [, rest] = split(props, ["style"]);
  return <Avatar {...rest} style={[messageLook().avatar, props.style ?? null]} />;
}

/** The column a message holds: its header, its turn and its footer, on the message's side. */
export function MessageContent(props: MessageContentProps) {
  const align = (): MessageAlign => MessageContext()?.() ?? "start";
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View {...rest} style={[messageLook().content(align()), props.style ?? null]}>
      {props.children}
    </View>
  );
}

/** Who sent the message, above the turn, at the start of the row. */
export function MessageHeader(props: MessageHeaderProps) {
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View {...rest} style={[messageLook().header, props.style ?? null]}>
      {typeof props.children === "string" ? (
        <Text style={messageLook().headerText}>{props.children}</Text>
      ) : (
        props.children
      )}
    </View>
  );
}

/** What is under the turn: a delivery status, actions, an error and a retry. A string child is a
 * line in the look's type; anything else is drawn as given. */
export function MessageFooter(props: MessageFooterProps) {
  const align = (): MessageAlign => MessageContext()?.() ?? "start";
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View {...rest} style={[messageLook().footer(align()), props.style ?? null]}>
      {typeof props.children === "string" ? (
        <Text style={messageLook().footerText}>{props.children}</Text>
      ) : (
        props.children
      )}
    </View>
  );
}
