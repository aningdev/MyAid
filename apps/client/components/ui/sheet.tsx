// A sheet: the look (`sheetPanel`, `sheetGrabber`) and the parts that wear it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors } from "../../lib/theme";
import type { JSX, StyleProp, ViewStyle } from "nsh";
import { context, keyboardFrame, safeArea, split, View, windowSize } from "nsh";
import {
  Sheet as BaseSheet,
  type OpenChangeReason,
  type SheetProps as BaseSheetProps,
} from "nsh/base";

import { Button, type ButtonVariant } from "./button";
import { createOpenState, type OpenState } from "../../lib/open-state";
import { backdrop } from "../../lib/overlay";

/** The edge of the screen a sheet comes from. */
export type SheetSide = "bottom" | "top" | "left" | "right";

/**
 * A sheet's panel (`nsh/base`'s `Sheet`'s `popupStyle`): the card's
 * surface with the border's edge. At the bottom (or the top) it spans the
 * width, its two inner corners 20 points round, 16 points of padding at its
 * sides and its rows 14 apart, kept above the home indicator (the sheet
 * itself stands above the keyboard), and never taller than the screen
 * below the status bar; put `sheetGrabber` first in a bottom one. At the
 * left or the right it is the full height, at most 360 points wide (48
 * short of a narrow window), its inner corners 16 round, 20 points of
 * padding inside the safe area.
 */
export function sheetPanel(side: SheetSide): ViewStyle {
  const surface: ViewStyle = { backgroundColor: colors.surface, borderColor: colors.border };
  if (side === "bottom" || side === "top") {
    const bottom = side === "bottom";
    return {
      ...surface,
      borderWidth: 1,
      ...(bottom
        ? { borderBottomWidth: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 }
        : {
            borderTopWidth: 0,
            borderBottomLeftRadius: 20,
            borderBottomRightRadius: 20,
            paddingTop: safeArea().top + 16,
            paddingBottom: 20,
          }),
      borderCurve: "continuous",
      // A bottom sheet stands above the keyboard while a field has it (`Sheet` lifts it by the keyboard past the home
      // indicator): its room is what the keyboard leaves.
      maxHeight:
        windowSize().height -
        (bottom
          ? safeArea().top + Math.max(0, keyboardFrame().height - safeArea().bottom)
          : safeArea().bottom) -
        24,
      paddingHorizontal: 16,
      // Above the home indicator, which is behind the keyboard while it is up.
      ...(bottom ? { paddingBottom: safeArea().bottom + 16 } : {}),
      gap: 14,
    };
  }
  const r = 16;
  return {
    ...surface,
    width: Math.min(360, windowSize().width - 48),
    paddingHorizontal: 20,
    paddingTop: safeArea().top + 16,
    paddingBottom: safeArea().bottom + 16,
    gap: 16,
    borderCurve: "continuous",
    ...(side === "right"
      ? { borderLeftWidth: 1, borderTopLeftRadius: r, borderBottomLeftRadius: r }
      : { borderRightWidth: 1, borderTopRightRadius: r, borderBottomRightRadius: r }),
  };
}

/** The grabber at the top of a bottom sheet (a view's `style`): a pill 36
 * by 5 points in the raised fill, centered. */
export function sheetGrabber(): ViewStyle {
  return {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: "center",
    backgroundColor: colors.raised,
  };
}

/** The root: it owns whether the sheet is open, and nothing of how it looks. */
export type SheetProps = {
  open?: boolean | null;
  defaultOpen?: boolean;
  children?: JSX.Element;
  onOpenChange?: (event: { open: boolean; reason: OpenChangeReason }) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
};

/**
 * The panel. Every prop of `nsh/base`'s Sheet passes through but the ones the root owns;
 * `popupStyle` and `backdropStyle` go over the look's.
 */
export type SheetContentProps = Omit<
  BaseSheetProps,
  "open" | "onOpenChange" | "onOpen" | "onClose" | "onCancel"
> & {
  /** The edge it comes from (default `bottom`). */
  side?: SheetSide;
  children?: JSX.Element;
};

export type SheetTriggerProps = {
  children?: string | JSX.Element;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export type SheetCloseProps = SheetTriggerProps & {
  onPress?: () => void;
};

type SheetContextValue = OpenState & Pick<SheetProps, "onOpen" | "onClose" | "onCancel">;

const SheetContext = context<SheetContextValue | null>(null);

function useSheet() {
  const ctx = SheetContext();
  if (!ctx) throw new Error("Sheet parts must be used within <Sheet>");
  return ctx;
}

/** The root of a sheet's parts. */
export function Sheet(props: SheetProps) {
  const state = createOpenState<OpenChangeReason>(props);
  return (
    <SheetContext.Provider
      value={{
        ...state,
        get onOpen() {
          return props.onOpen;
        },
        get onClose() {
          return props.onClose;
        },
        get onCancel() {
          return props.onCancel;
        },
      }}
    >
      {props.children}
    </SheetContext.Provider>
  );
}

function Action(props: SheetTriggerProps & { onPress: () => void }) {
  if (typeof props.children === "string") {
    return (
      <Button
        variant={props.variant ?? "secondary"}
        disabled={props.disabled}
        style={props.style}
        onPress={props.onPress}
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
      onPress={props.disabled ? undefined : props.onPress}
      style={props.style}
    >
      {props.children}
    </View>
  );
}

/** Opens the sheet. */
export function SheetTrigger(props: SheetTriggerProps) {
  const ctx = useSheet();
  return (
    <Action {...props} onPress={() => ctx.setOpen(true)}>
      {props.children}
    </Action>
  );
}

/** Closes the sheet, after its own `onPress`. */
export function SheetClose(props: SheetCloseProps) {
  const ctx = useSheet();
  return (
    <Action
      {...props}
      onPress={() => {
        props.onPress?.();
        ctx.setOpen(false, "closePress");
      }}
    >
      {props.children}
    </Action>
  );
}

/** The panel that slides in from `side`, over the theme's scrim. */
export function SheetContent(props: SheetContentProps) {
  const ctx = useSheet();
  const [, rest] = split(props, ["side", "children", "popupStyle", "backdropStyle"]);
  const side = props.side ?? "bottom";
  return (
    <BaseSheet
      {...rest}
      side={side}
      open={ctx.open()}
      onOpenChange={({ open, reason }) => ctx.setOpen(open, reason)}
      onOpen={ctx.onOpen}
      onClose={ctx.onClose}
      onCancel={ctx.onCancel}
      backdropStyle={[backdrop(), props.backdropStyle ?? null]}
      popupStyle={[sheetPanel(side), props.popupStyle ?? null]}
    >
      {side === "bottom" ? <View style={sheetGrabber()} /> : null}
      {props.children}
    </BaseSheet>
  );
}
