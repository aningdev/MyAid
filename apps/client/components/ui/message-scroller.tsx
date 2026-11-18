// A conversation that scrolls, and keeps up with it: new turns follow the newest message while the
// reader is at the end, and stay where they are when the reader has scrolled up. This library's own
// (drawn on `nsh`'s Scroll, View and Text, the button on `Button`), so there is no port region.
// Yours to change.
import { follow, motion } from "../../lib/theme";
import { ArrowDown, ArrowUp } from "lucide";
import type {
  Bounds,
  ScrollEvent,
  ScrollProps,
  Signal,
  StyleProp,
  ViewProps,
  ViewRef,
  ViewStyle,
} from "nsh";
import { context, Scroll, signal, split, View } from "nsh";

import { Button, buttonGlyph, type ButtonProps } from "./button";
import { Icon } from "../../lib/icons";
import { PILL_RADIUS } from "../../lib/surface";

/** Which way a scroller's button sends the viewport: `end`, the newest message; `start`, the
 * oldest. */
export type MessageScrollerDirection = "start" | "end";

/** Where a scroller starts: at the end (the newest message, and it follows new ones) or at the
 * start (the oldest, and it stays put). */
export type MessageScrollerInitialScroll = "start" | "end";

/** How close to an edge still counts as being there: 16 points. */
const edge = 16;

/** How far apart the messages of a conversation sit: 32 points, shadcn/ui's `gap-8`. */
const itemGap = 32;

/** How far a scroller's button sits from the edge it points past: 16 points. */
const buttonInset = 16;

/** A point of slack in the overflow test, so a height rounded under a viewport's is not an overflow. */
const slack = 1;

/** What a scroller keeps: where the viewport is, how tall it and its content are, and the view
 * whose end it reveals. */
interface Scroller {
  /** The viewport is at the end of the content (and follows what comes next). */
  atEnd: () => boolean;
  /** The viewport is at the start of the content. */
  atStart: () => boolean;
  /** The content is taller than the viewport. */
  overflows: () => boolean;
  /** Reads a scroll event: where the viewport is now. */
  settle(e: ScrollEvent): void;
  /** Says the content's height, and whether it overflows. */
  measureContent(height: number): void;
  /** Says the viewport's height. */
  measureViewport(height: number): void;
  /** Reveals the content's end once this turn's changes are laid out. */
  reveal(animated: boolean): void;
  /** The content's view, once it has one. */
  content: Signal<ViewRef | undefined>;
}

/** What the parts of a message scroller wear between them. */
const MessageScrollerContext = context<Scroller | null>(null);

/** A message scroller's parts as the styles they wear: spread each one onto the part that matches
 * its name. */
export interface MessageScrollerLook {
  /** The frame (`MessageScroller`): a column that fills its parent and clips what is in it. */
  readonly root: ViewStyle;
  /** The viewport (`MessageScrollerViewport`): the room left by the frame, a scroll view's own. */
  readonly viewport: ViewStyle;
  /** The content (`MessageScrollerContent`): a column 32 points apart, at least as tall as the
   * viewport. */
  readonly content: ViewStyle;
  /** A turn (`MessageScrollerItem`): never narrower nor shorter than what is in it. */
  readonly item: ViewStyle;
  /** The room a button floats in (`MessageScrollerButton`): the width of the viewport, 16 points
   * from the edge it points past, its child in the middle. It takes no presses of its own. */
  slot(direction: MessageScrollerDirection): ViewStyle;
  /** The button itself: raised, hidden until there is somewhere to go. */
  readonly button: ViewStyle;
}

/**
 * A conversation's look, after shadcn/ui's message scroller: a frame that fills its parent and
 * clips, a viewport that takes the room left, a content column 32 points apart at least as tall as
 * the viewport, and a raised button floating 16 points above the newest message (or below the
 * oldest), in the middle of the viewport.
 */
export function messageScrollerLook(): MessageScrollerLook {
  return {
    get root(): ViewStyle {
      return {
        flexDirection: "column",
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 0,
        width: "100%",
        position: "relative",
        overflow: "hidden",
      };
    },
    get viewport(): ViewStyle {
      return { flexGrow: 1, flexShrink: 1, minHeight: 0, width: "100%" };
    },
    get content(): ViewStyle {
      return { flexDirection: "column", gap: itemGap, minHeight: "100%" };
    },
    get item(): ViewStyle {
      return { minWidth: 0, flexShrink: 0 };
    },
    slot: (direction: MessageScrollerDirection): ViewStyle => ({
      position: "absolute",
      left: 0,
      right: 0,
      alignItems: "center",
      pointerEvents: "box-none",
      zIndex: 10,
      ...(direction === "end" ? { bottom: buttonInset } : { top: buttonInset }),
    }),
    get button(): ViewStyle {
      return { borderRadius: PILL_RADIUS };
    },
  };
}

/** A message scroller's props. Every `nsh` view prop passes through. */
export type MessageScrollerProps = ViewProps & {
  /** Default `end`: the viewport opens at the newest message and follows new ones. `start` opens
   * at the oldest and stays there until a button sends it. */
  initialScroll?: MessageScrollerInitialScroll;
};

/** The viewport's props: a scroll view's, less the direction and the state it keeps itself. */
export type MessageScrollerViewportProps = Omit<
  ScrollProps,
  "horizontal" | "ref" | "onScroll" | "children"
> & {
  /** What is in the viewport: a `MessageScrollerContent`. */
  children?: ViewProps["children"];
  /** Called on every scroll, after the scroller has read it. */
  onScroll?: (e: ScrollEvent) => void;
  /** Called on every layout, after the scroller has read it. */
  onLayout?: (e: { bounds: Bounds }) => void;
  /** The style of the scroll view. */
  style?: StyleProp<ViewStyle>;
};

/** The content's props: a view's. */
export type MessageScrollerContentProps = ViewProps;

/** A turn's props: a view's. */
export type MessageScrollerItemProps = ViewProps;

/** The button's props: a button's, with the direction it points and what it says. */
export type MessageScrollerButtonProps = Omit<ButtonProps, "children"> & {
  /** Default `end`: above the newest message, pointing down. `start` goes to the oldest. */
  direction?: MessageScrollerDirection;
  /** Default: an arrow, and the button's name for screen readers ("Scroll to end"). */
  children?: ButtonProps["children"];
};

/**
 * A conversation that scrolls, after shadcn/ui's message scroller: a frame whose viewport holds the
 * turns, and that keeps itself at the newest one while the reader is there — and where the reader
 * left it when they are not. `initialScroll` says where it opens; `MessageScrollerButton` takes the
 * reader back to either end.
 */
export function MessageScroller(props: MessageScrollerProps) {
  const [, rest] = split(props, ["initialScroll", "children", "style"]);
  const atEnd = signal(props.initialScroll !== "start");
  const atStart = signal(props.initialScroll !== "end");
  const viewport = signal(0);
  const content = signal(0);
  const contentView = signal<ViewRef | undefined>(undefined);
  const overflows = () => content() > viewport() + slack;
  const scroller: Scroller = {
    atEnd,
    atStart,
    overflows,
    content: contentView,
    settle: (e: ScrollEvent) => {
      const bottom = e.contentSize.height - e.offset.y - e.size.height;
      atEnd.set(bottom <= edge);
      atStart.set(e.offset.y <= edge);
    },
    measureContent: (height: number) => content.set(height),
    measureViewport: (height: number) => viewport.set(height),
    reveal: (animated: boolean) => contentView()?.reveal({ vertical: "end", animated }),
  };
  return (
    <MessageScrollerContext.Provider value={scroller}>
      <View {...rest} style={[messageScrollerLook().root, props.style ?? null]}>
        {props.children}
      </View>
    </MessageScrollerContext.Provider>
  );
}

/**
 * The room the turns scroll in. It keeps the scroller's word on where it is: at the end, at the
 * start, or in between — what lets a new message follow the reader without stealing their place.
 */
export function MessageScrollerViewport(props: MessageScrollerViewportProps) {
  const scroller = MessageScrollerContext();
  const [, rest] = split(props, ["onScroll", "onLayout", "children", "style", "contentStyle"]);
  return (
    <Scroll
      {...rest}
      role="group"
      onScroll={(e: ScrollEvent) => {
        scroller?.settle(e);
        props.onScroll?.(e);
      }}
      onLayout={(e) => {
        scroller?.measureViewport(e.bounds.size.height);
        props.onLayout?.(e);
      }}
      style={[messageScrollerLook().viewport, props.style ?? null]}
      contentStyle={props.contentStyle}
    >
      {props.children}
    </Scroll>
  );
}

/**
 * What the turns are in: a column 32 points apart, at least as tall as the viewport. When it grows
 * while the reader is at the end, it follows the growth; when the reader has scrolled up, it leaves
 * them where they are.
 */
export function MessageScrollerContent(props: MessageScrollerContentProps) {
  const scroller = MessageScrollerContext();
  const [, rest] = split(props, ["children", "style", "onLayout"]);
  return (
    <View
      {...rest}
      ref={(node) => {
        scroller?.content.set(node);
      }}
      onLayout={(e) => {
        scroller?.measureContent(e.bounds.size.height);
        props.onLayout?.(e);
        if (scroller?.atEnd()) scroller.reveal(false);
      }}
      style={[messageScrollerLook().content, props.style ?? null]}
    >
      {props.children}
    </View>
  );
}

/**
 * One turn of the conversation. shadcn/ui anchors one item so that the reader's place holds while
 * older turns load above; NSH has no scroll anchoring, so this is a plain view and the place is
 * the app's to keep.
 */
export function MessageScrollerItem(props: MessageScrollerItemProps) {
  const [, rest] = split(props, ["children", "style"]);
  return (
    <View {...rest} style={[messageScrollerLook().item, props.style ?? null]}>
      {props.children}
    </View>
  );
}

/**
 * A button that takes the reader back to an end of the conversation, floating 16 points above the
 * newest turn (or below the oldest). It shows only while there is somewhere to go that way, and
 * says "Scroll to end" or "Scroll to start" to screen readers.
 */
export function MessageScrollerButton(props: MessageScrollerButtonProps) {
  const scroller = MessageScrollerContext();
  const direction = (): MessageScrollerDirection => props.direction ?? "end";
  const away = () =>
    direction() === "end" ? !(scroller?.atEnd() ?? true) : !(scroller?.atStart() ?? true);
  const shown = () => (scroller?.overflows() ?? false) && away();
  const slide = follow(() => (shown() ? 1 : 0), motion.move);
  const [, rest] = split(props, ["direction", "children", "style", "onPress"]);
  const label =
    props.accessibilityLabel ?? (direction() === "end" ? "Scroll to end" : "Scroll to start");
  return (
    <View style={messageScrollerLook().slot(direction())}>
      <Button
        {...rest}
        variant="secondary"
        size="sm"
        accessibilityLabel={label}
        onPress={() => {
          scroller?.reveal(true);
          props.onPress?.();
        }}
        style={[
          messageScrollerLook().button,
          { opacity: slide, pointerEvents: shown() ? "auto" : "none" },
          props.style ?? null,
        ]}
      >
        {props.children ?? (
          <Icon
            icon={direction() === "end" ? ArrowDown : ArrowUp}
            {...buttonGlyph("secondary", { size: "sm" })}
          />
        )}
      </Button>
    </View>
  );
}
