// A hover card: `nsh/base`'s HoverCard with `popoverLook` on a `PopIn`.
// The surface look lives in `popover.tsx` (from look/overlay.ts); this file is the shell only.
import { focusRing } from "../../lib/theme";
import type { JSX, StyleProp, ViewStyle } from "nsh";
import { context, split, View } from "nsh";
import {
  HoverCard as BaseHoverCard,
  type HoverCardProps as BaseHoverCardProps,
  type OpenChangeReason,
} from "nsh/base";

import { Button, type ButtonVariant } from "./button";
import { createOpenState, createSlot, type OpenState, type Slot } from "../../lib/open-state";
import { PopIn } from "../../lib/popup";
import { popoverLook } from "./popover";

/** The root: it owns whether the card is open, the trigger slot, and whether the trigger is off. */
export type HoverCardProps = {
  /** Controlled; leave it out and the root keeps the state (`defaultOpen`). */
  open?: boolean | null;
  defaultOpen?: boolean;
  children?: JSX.Element;
  onOpenChange?: (event: { open: boolean; reason: HoverCardOpenChangeReason }) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

/**
 * The card. Every prop of `nsh/base`'s HoverCard passes through but the ones the root owns;
 * `popoverLook` is the surface of the `PopIn` it comes in with. Defaults: placement `bottom`.
 */
export type HoverCardContentProps = Omit<
  BaseHoverCardProps,
  "trigger" | "open" | "defaultOpen" | "onOpenChange" | "onOpen" | "onClose" | "children"
> & {
  /** A line or two: 12 points of padding and 4 between rows. */
  compact?: boolean;
  /** The card's width; unset, as wide as its content. */
  width?: number;
  children?: JSX.Element;
};

/** What the card previews: a string is a `Button`'s label, anything else a pressable of its own. */
export type HoverCardTriggerProps = {
  children?: string | JSX.Element;
  /** The button's variant, for a string child (default `secondary`). */
  variant?: ButtonVariant;
  /** A disabled trigger does not open the card. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

type HoverCardContextValue = OpenState & {
  trigger: Slot;
  /** The trigger is disabled: the card stays closed. Reads the trigger's latest value. */
  disabled: () => boolean;
  setDisabled: (read: () => boolean) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

const HoverCardContext = context<HoverCardContextValue | null>(null);

function useHoverCard() {
  const ctx = HoverCardContext();
  if (!ctx) throw new Error("HoverCard parts must be used within <HoverCard>");
  return ctx;
}

/** The root of a hover card's parts. */
export function HoverCard(props: HoverCardProps) {
  const state = createOpenState<OpenChangeReason>(props);
  const trigger = createSlot();
  const off = { read: () => false };
  return (
    <HoverCardContext.Provider
      value={{
        ...state,
        trigger,
        disabled: () => off.read(),
        setDisabled: (read) => {
          off.read = read;
        },
        get onOpen() {
          return props.onOpen;
        },
        get onClose() {
          return props.onClose;
        },
      }}
    >
      {props.children}
    </HoverCardContext.Provider>
  );
}

/** The preview target: a `Button` for a string, else a pressable view. */
export function HoverCardTrigger(props: HoverCardTriggerProps) {
  const ctx = useHoverCard();
  ctx.setDisabled(() => Boolean(props.disabled));
  ctx.trigger.set(() => {
    if (typeof props.children === "string") {
      return (
        <Button
          variant={props.variant ?? "secondary"}
          disabled={props.disabled}
          style={props.style}
        >
          {props.children}
        </Button>
      );
    }
    return (
      <View
        accessible
        role="button"
        accessibilityState={{ disabled: props.disabled }}
        focusVisibleStyle={focusRing()}
        style={props.style}
      >
        {props.children}
      </View>
    );
  });
  return null;
}

/** The card, over the popup surface of `popoverLook`. */
export function HoverCardContent(props: HoverCardContentProps) {
  const ctx = useHoverCard();
  const triggerAccessor = ctx.trigger.get();
  const [, rest] = split(props, [
    "children",
    "compact",
    "width",
    "placement",
    "align",
    "offset",
    "margin",
  ]);
  const placement = () => props.placement ?? "bottom";
  return (
    <BaseHoverCard
      {...rest}
      open={ctx.disabled() ? false : ctx.open()}
      trigger={(triggerAccessor?.() as JSX.Element) ?? <View />}
      placement={placement()}
      align={props.align}
      offset={props.offset}
      margin={props.margin}
      onOpenChange={({ open, reason }) => {
        if (ctx.disabled()) return;
        ctx.setOpen(open, reason);
      }}
      onOpen={ctx.onOpen}
      onClose={ctx.onClose}
    >
      {() => (
        <PopIn
          side={placement()}
          style={popoverLook({ compact: props.compact, width: props.width })}
        >
          {props.children}
        </PopIn>
      )}
    </BaseHoverCard>
  );
}

/** Why a hover card closed (`onOpenChange`'s `reason`): `nsh/base`'s `OpenChangeReason`, under this part's name. */
export type HoverCardOpenChangeReason = OpenChangeReason;
