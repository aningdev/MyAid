// An attachment: a file, an image or a link that a message or a composer carries, with what it is
// called, how it is doing, and what can be done to it. This library's own (drawn on `nsh`'s View
// and Text, the buttons on `Button`), so there is no port region. Yours to change.
import { alpha, colors, focusRing, radius, tints } from "../../lib/theme";
import type { TextProps, TextStyle, ViewProps, ViewStyle } from "nsh";
import { context, Scroll, split, Text, token, View } from "nsh";

import { Button, type ButtonProps } from "./button";
import { density } from "../../lib/surface";

/** How an attachment is doing: `idle`, not sent yet; `uploading` and `processing`, on their way;
 * `done`, there; `error`, failed. */
export type AttachmentState = "idle" | "uploading" | "processing" | "error" | "done";

/** How big an attachment is: `default` (40-point media, the body's type), `sm` (32, the note's),
 * `xs` (28, the note's, in a chip). */
export type AttachmentSize = "default" | "sm" | "xs";

/** Which way an attachment runs: `horizontal`, media beside its text (a file in a row);
 * `vertical`, media above it (a picture in a strip). */
export type AttachmentOrientation = "horizontal" | "vertical";

/** What an attachment's media holds: `icon`, a glyph of the app's; `image`, a picture the app
 * draws inside it, faded until the attachment is done or idle. */
export type AttachmentMediaVariant = "icon" | "image";

/** The gaps and sizes of an attachment, by `size`. Its corners are not here: a theme is read where
 * the frame is drawn (`corners`), never into a module's constant. */
const sizes = {
  default: { gap: 8, padX: 10, padY: 8, media: 40, glyph: 16, title: density.body, minWidth: 160 },
  sm: { gap: 10, padX: 8, padY: 6, media: 32, glyph: 16, title: density.note, minWidth: 0 },
  xs: { gap: 6, padX: 6, padY: 4, media: 28, glyph: 14, title: density.note, minWidth: 0 },
} as const;

/** The frame's corners at a size: a card's, and the inset's at `xs`. Read where the frame is
 * drawn — `radius` is the theme's. */
const corners = (size: AttachmentSize): number => (size === "xs" ? radius.inset : radius.card);

/** The width of a vertical attachment, and of the row that groups attachments. */
const verticalWidth = 120;
const groupGap = 12;

/** The axes an `Attachment` hands down to its parts: how it is doing, how big it is, which way it
 * runs. Read where used, so a part follows its frame. */
interface AttachmentAxes {
  state: () => AttachmentState;
  size: () => AttachmentSize;
  orientation: () => AttachmentOrientation;
}

/** What a part of an attachment is told, or `null` when it is drawn on its own. */
const AttachmentContext = context<AttachmentAxes | null>(null);

/** What a part wears when it is not under an `Attachment`. */
const unattached: AttachmentAxes = {
  state: () => "done",
  size: () => "default",
  orientation: () => "horizontal",
};

/** An attachment's parts as the styles they wear: spread each one onto the part that matches its name. */
export interface AttachmentLook {
  /** The group of attachments (`AttachmentGroup`): a row 12 points apart that scrolls sideways. */
  readonly group: ViewStyle;
  /** Its content: the same row, as a scroll view's. */
  readonly groupContent: ViewStyle;
  /** The attachment (`Attachment`): a frame in the card's fill with a hairline edge, the card's
   * corners (`inset`'s at `xs`), as wide as what it holds, 160 points wide at least at `default`,
   * and 120 when `vertical`. `idle`'s edge is dashed, `error`'s in the danger tone. */
  root(state: AttachmentState, size: AttachmentSize, orientation: AttachmentOrientation): ViewStyle;
  /** Its media (`AttachmentMedia`): the muted fill, a square of 40 / 32 / 28 points — the full width
   * of a vertical attachment, where the glyph is 24. In the danger tone when the attachment failed. */
  media(
    size: AttachmentSize,
    orientation: AttachmentOrientation,
    variant: AttachmentMediaVariant,
    state: AttachmentState,
  ): ViewStyle;
  /** The text beside the media (`AttachmentContent`): a column that takes the room left, tight
   * leading, 4 points of side padding when the attachment is vertical. */
  content(orientation: AttachmentOrientation): ViewStyle;
  /** What the attachment is called (`AttachmentTitle`): medium in the page's ink, one line,
   * truncated. */
  title(size: AttachmentSize): TextStyle;
  /** What it is doing (`AttachmentDescription`): 2 points under the title, the note's size in the
   * muted ink, one line, truncated — in the danger tone on a failure. */
  description(state: AttachmentState): TextStyle;
  /** What can be done to it (`AttachmentActions`): a row 4 points apart, in the corner when the
   * attachment is vertical. */
  actions(orientation: AttachmentOrientation): ViewStyle;
  /** Its trigger (`AttachmentTrigger`): a pressable over the whole frame, above the media and
   * below the actions. */
  readonly trigger: ViewStyle;
}

/** The illustration of a media's glyph, by size and orientation. */
export const attachmentGlyph = (size: AttachmentSize, orientation: AttachmentOrientation): number =>
  orientation === "vertical" ? 24 : sizes[size].glyph;

/**
 * An attachment's look, after shadcn/ui's: a frame as wide as it holds in the card's fill with a
 * hairline edge — dashed when `idle`, in the danger tone when failed — the card's corners (the
 * inset's at `xs`); its media a square of the muted fill 40 / 32 / 28 points across (the full width
 * of a vertical attachment); its text a column that takes the room left, the title medium in one
 * line and the description the note's size under it in the muted ink, 10 / 8 / 6 points in from the
 * frame's edge and 8 / 6 / 4 above and below.
 */
export function attachmentLook(): AttachmentLook {
  return {
    get group(): ViewStyle {
      return { width: "100%", flexGrow: 0, flexShrink: 0 };
    },
    get groupContent(): ViewStyle {
      return { flexDirection: "row", alignItems: "flex-start", gap: groupGap };
    },
    root: (
      state: AttachmentState,
      size: AttachmentSize,
      orientation: AttachmentOrientation,
    ): ViewStyle => ({
      flexDirection: orientation === "vertical" ? "column" : "row",
      alignItems: orientation === "vertical" ? "stretch" : "center",
      gap: sizes[size].gap,
      width: orientation === "vertical" ? verticalWidth : "fit-content",
      minWidth: sizes[size].minWidth,
      maxWidth: "100%",
      minHeight: 0,
      borderRadius: corners(size),
      borderCurve: "continuous",
      borderWidth: 1,
      borderStyle: state === "idle" ? "dashed" : "solid",
      borderColor: state === "error" ? alpha(colors.danger, 0.3) : colors.border,
      backgroundColor: colors.surface,
      ...(orientation === "horizontal"
        ? { paddingHorizontal: sizes[size].padX, paddingVertical: sizes[size].padY }
        : { padding: sizes[size].gap }),
    }),
    media: (
      size: AttachmentSize,
      orientation: AttachmentOrientation,
      variant: AttachmentMediaVariant,
      state: AttachmentState,
    ): ViewStyle => ({
      width: orientation === "vertical" ? "100%" : sizes[size].media,
      height: orientation === "vertical" ? undefined : sizes[size].media,
      aspectRatio: orientation === "vertical" ? 1 : undefined,
      flexShrink: 0,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderRadius: size === "xs" ? radius.control : radius.inset,
      backgroundColor: state === "error" ? tints.danger : token("muted"),
      ...(variant === "image" && state !== "done" && state !== "idle" ? { opacity: 0.6 } : {}),
    }),
    content: (orientation: AttachmentOrientation): ViewStyle => ({
      flexDirection: "column",
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
      maxWidth: "100%",
      ...(orientation === "vertical" ? { paddingHorizontal: 4 } : {}),
    }),
    title: (size: AttachmentSize): TextStyle => ({
      fontSize: sizes[size].title,
      fontWeight: "500",
      color: colors.text,
      numberOfLines: 1,
    }),
    description: (state: AttachmentState): TextStyle => ({
      marginTop: 2,
      fontSize: density.note,
      color: state === "error" ? colors.danger : colors.muted,
      numberOfLines: 1,
    }),
    actions: (orientation: AttachmentOrientation): ViewStyle => ({
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      flexShrink: 0,
      zIndex: 20,
      ...(orientation === "vertical" ? { position: "absolute", top: 12, right: 12 } : {}),
    }),
    get trigger(): ViewStyle {
      return {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 10,
        borderRadius: radius.card,
        borderWidth: 0,
        backgroundColor: "transparent",
      };
    },
  };
}

/** An attachment's props. Every `nsh` view prop passes through; `style` goes over the look's. */
export type AttachmentProps = ViewProps & {
  /** Default `done`. */
  state?: AttachmentState;
  /** Default `default`. */
  size?: AttachmentSize;
  /** Default `horizontal`. */
  orientation?: AttachmentOrientation;
};

/** A group's props: the view's, but its `ref` is the scroll view's. */
export type AttachmentGroupProps = Omit<ViewProps, "ref">;

/** The media's props: an `Icon` (size it with `attachmentGlyph`) or a picture. */
export type AttachmentMediaProps = ViewProps & {
  /** Default `icon`. */
  variant?: AttachmentMediaVariant;
};

/** The title: a string in the look's type, one line, truncated. */
export type AttachmentTitleProps = Omit<TextProps, "children"> & {
  /** What the file is called. */
  children?: string;
};

/** The description: a string in the look's type, one line, truncated. */
export type AttachmentDescriptionProps = Omit<TextProps, "children"> & {
  /** What it is doing, or what it weighs. */
  children?: string;
};

/** An action on an attachment: this library's `Button`, ghost and small unless told otherwise. */
export type AttachmentActionProps = ButtonProps;

/** The trigger's props: the frame's own pressable, so `onPress`, `accessibilityLabel` and the
 * view's props. */
export type AttachmentTriggerProps = Omit<ViewProps, "children">;

/**
 * A file or a picture carried by a message or a composer, after shadcn/ui's attachment: its media,
 * what it is called, how it is doing, and what can be done to it. `state` says how it is doing,
 * `size` how big it is, `orientation` whether the media sits beside the text or above it.
 */
export function Attachment(props: AttachmentProps) {
  const state = () => props.state ?? "done";
  const size = () => props.size ?? "default";
  const orientation = () => props.orientation ?? "horizontal";
  const [, rest] = split(props, ["state", "size", "orientation", "children", "style"]);
  return (
    <AttachmentContext.Provider value={{ state, size, orientation }}>
      <View
        {...rest}
        style={[attachmentLook().root(state(), size(), orientation()), props.style ?? null]}
      >
        {props.children}
      </View>
    </AttachmentContext.Provider>
  );
}

/**
 * Attachments in a row that scrolls sideways when they do not fit, 12 points apart. A row of
 * files under a message, a strip of pictures in a composer.
 */
export function AttachmentGroup(props: AttachmentGroupProps) {
  const [, rest] = split(props, ["children", "style"]);
  return (
    <Scroll
      {...rest}
      horizontal
      scrollbar={false}
      style={[attachmentLook().group, props.style ?? null]}
      contentStyle={attachmentLook().groupContent}
    >
      {props.children}
    </Scroll>
  );
}

/** The media of an attachment: an `Icon` of `attachmentGlyph(size, orientation)` points, or a
 * picture drawn into a square. */
export function AttachmentMedia(props: AttachmentMediaProps) {
  const attachment = AttachmentContext() ?? unattached;
  const variant = () => props.variant ?? "icon";
  const [, rest] = split(props, ["variant", "children", "style"]);
  return (
    <View
      {...rest}
      style={[
        attachmentLook().media(
          attachment.size(),
          attachment.orientation(),
          variant(),
          attachment.state(),
        ),
        props.style ?? null,
      ]}
    >
      {props.children}
    </View>
  );
}

/** The text's props: a view's. */
export type AttachmentContentProps = ViewProps;

/** The text of an attachment: its title and its description, in a column that takes the room
 * left. */
export function AttachmentContent(props: AttachmentContentProps) {
  const attachment = AttachmentContext() ?? unattached;
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View
      {...rest}
      style={[attachmentLook().content(attachment.orientation()), props.style ?? null]}
    >
      {props.children}
    </View>
  );
}

/** What the file is called, in one line. */
export function AttachmentTitle(props: AttachmentTitleProps) {
  const attachment = AttachmentContext() ?? unattached;
  const [, rest] = split(props, ["children", "style"]);
  return (
    <Text {...rest} style={[attachmentLook().title(attachment.size()), props.style ?? null]}>
      {props.children}
    </Text>
  );
}

/** What the attachment is doing, or what it weighs, in one line under its title. */
export function AttachmentDescription(props: AttachmentDescriptionProps) {
  const attachment = AttachmentContext() ?? unattached;
  const [, rest] = split(props, ["children", "style"]);
  return (
    <Text {...rest} style={[attachmentLook().description(attachment.state()), props.style ?? null]}>
      {props.children}
    </Text>
  );
}

/** The actions' props: a view's. */
export type AttachmentActionsProps = ViewProps;

/** The actions on an attachment: a remove, a retry, a preview. They sit beside the text, or in the
 * corner of a vertical attachment. */
export function AttachmentActions(props: AttachmentActionsProps) {
  const attachment = AttachmentContext() ?? unattached;
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View
      {...rest}
      style={[attachmentLook().actions(attachment.orientation()), props.style ?? null]}
    >
      {props.children}
    </View>
  );
}

/** An action on an attachment: ghost and small, an icon or a label. */
export function AttachmentAction(props: AttachmentActionProps) {
  return <Button variant="ghost" size="sm" {...props} />;
}

/**
 * A pressable over the whole attachment: press it to open the file. Give it a name for screen
 * readers (`accessibilityLabel`). shadcn/ui's `asChild`, which turns a link of yours into the
 * trigger, has no equivalent here — the trigger is the frame's own pressable.
 */
export function AttachmentTrigger(props: AttachmentTriggerProps) {
  const [, rest] = split(props, ["style"]);
  return (
    <View
      {...rest}
      role="button"
      style={[attachmentLook().trigger, props.style ?? null]}
      hoverStyle={{ backgroundColor: alpha(colors.text, 0.04) }}
      focusVisibleStyle={focusRing()}
    />
  );
}
