// A card dialog: the look (`dialogCard`, `dialogTitle`, `dialogText`) at the top, and the parts that
// wear it below. `nsh/base`'s `Dialog` is the box; what this file adds is its card.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors, finish, radius, terminal } from "../../lib/theme";
import type { JSX, StyleProp, TextStyle, ViewStyle } from "nsh";
import { context, platform, split, Text, View } from "nsh";
import {
  Dialog as BaseDialog,
  type DialogChangeReason,
  type DialogProps as BaseDialogProps,
} from "nsh/base";

import { Action, type ButtonVariant } from "./button";
import { createOpenState, type OpenState } from "../../lib/open-state";
import { backdrop } from "../../lib/popup";

const pointer = platform.desktop;

/** A card's width where the app gives none: 360 points with a pointer, 320 on a touch screen
 * (upstream's dialog demo, `el-dialog`; never wider than 90% of the window). */
const cardWidth = pointer ? 360 : 320;

/**
 * A dialog shown as a card in the middle of the window, over `backdrop()`:
 * the card's surface with the border's edge and the floating shadow of a
 * menu (`finish.menu`), the theme's `radius-popover` corners, 20 points of
 * padding, its rows 12 apart. Given a `width`, it is `nsh/base`'s `Dialog`'s `style` itself:
 * centered, `width` across and never wider than 90% of the window; without
 * one, the look alone, for a view inside the dialog (one that springs in).
 * A terminal draws its edge alone.
 */
export function dialogCard(width?: number): ViewStyle {
  return {
    ...(width === undefined ? {} : { margin: "auto", width, maxWidth: "90%" }),
    borderRadius: radius.popover,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 12,
    ...(terminal ? {} : { backgroundColor: colors.surface, boxShadow: finish.menu.boxShadow }),
  };
}

/** A card dialog's title (`dialogCard`): 17 points semibold with a pointer, 20 on a touch screen. */
export function dialogTitle(): TextStyle {
  return { fontSize: pointer ? 17 : 20, fontWeight: "600", color: colors.text };
}

/** A card dialog's text under its title: 13 points with a pointer, 15 on a touch screen, muted. */
export function dialogText(): TextStyle {
  return { fontSize: pointer ? 13 : 15, lineHeight: pointer ? 19 : 21, color: colors.muted };
}

/** The root: it owns whether the dialog is open, and nothing of how it looks. */
export type DialogProps = {
  /** Controlled; leave it out and the root keeps the state (`defaultOpen`). */
  open?: boolean | null;
  defaultOpen?: boolean;
  children?: JSX.Element;
  onOpenChange?: (event: { open: boolean; reason: DialogChangeReason }) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
};

/**
 * The card. Every prop of `nsh/base`'s Dialog passes through but the ones the root owns;
 * `style` and `backdropStyle` go over the look's. `animation` defaults to `fade`, a card's.
 */
export type DialogContentProps = Omit<
  BaseDialogProps,
  "open" | "onOpenChange" | "onOpen" | "onClose" | "onCancel"
> & {
  /** The card's width, never wider than 90% of the window (default 360 with a pointer, 320 on a touch screen). */
  width?: number;
};

/** What opens the dialog: a string is a `Button`'s label, anything else a pressable of its own. */
export type DialogTriggerProps = {
  children?: string | JSX.Element;
  /** The button's variant, for a string child (default `secondary`). */
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** What closes the dialog: as `DialogTrigger`; `onPress` runs before it closes. */
export type DialogCloseProps = DialogTriggerProps & {
  onPress?: () => void;
};

/** A text part of the card (`DialogTitle`, `DialogDescription`). */
export type DialogTextProps = {
  children?: string | JSX.Element;
  style?: StyleProp<TextStyle>;
};

/** The row of actions at the card's end. */
export type DialogFooterProps = {
  children?: JSX.Element;
  style?: StyleProp<ViewStyle>;
};

type DialogContextValue = OpenState & Pick<DialogProps, "onOpen" | "onClose" | "onCancel">;

const DialogContext = context<DialogContextValue | null>(null);

function useDialog() {
  const ctx = DialogContext();
  if (!ctx) throw new Error("Dialog parts must be used within <Dialog>");
  return ctx;
}

/** The root of a dialog's parts. */
export function Dialog(props: DialogProps) {
  const state = createOpenState<DialogChangeReason>(props);
  return (
    <DialogContext.Provider
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
    </DialogContext.Provider>
  );
}

/** Opens the dialog. */
export function DialogTrigger(props: DialogTriggerProps) {
  const ctx = useDialog();
  return <Action {...props} onPress={() => ctx.setOpen(true)} />;
}

/** Closes the dialog, after its own `onPress`. */
export function DialogClose(props: DialogCloseProps) {
  const ctx = useDialog();
  return (
    <Action
      {...props}
      onPress={() => {
        props.onPress?.();
        ctx.setOpen(false, "closePress");
      }}
    />
  );
}

/** The card, over the theme's scrim. */
export function DialogContent(props: DialogContentProps) {
  const ctx = useDialog();
  const [, rest] = split(props, ["width", "children", "style", "backdropStyle", "animation"]);
  return (
    <BaseDialog
      {...rest}
      open={ctx.open()}
      animation={props.animation ?? "fade"}
      onOpenChange={({ open, reason }) => ctx.setOpen(open, reason)}
      onOpen={ctx.onOpen}
      onClose={ctx.onClose}
      onCancel={ctx.onCancel}
      backdropStyle={[backdrop(), props.backdropStyle ?? null]}
      style={[dialogCard(props.width ?? cardWidth), props.style ?? null]}
    >
      {props.children}
    </BaseDialog>
  );
}

/** The card's title; a string child takes `dialogTitle`'s type, anything else is drawn as given. */
export function DialogTitle(props: DialogTextProps) {
  if (typeof props.children !== "string") return props.children;
  return <Text style={[dialogTitle(), props.style ?? null]}>{props.children}</Text>;
}

/** The text under the title; a string child takes `dialogText`'s type, anything else as given. */
export function DialogDescription(props: DialogTextProps) {
  if (typeof props.children !== "string") return props.children;
  return <Text style={[dialogText(), props.style ?? null]}>{props.children}</Text>;
}

/**
 * The row of the card's actions, laid out as upstream's dialog demo (`el-dialog`) lays them:
 * 8 points apart, at the trailing edge with a pointer. On a touch screen the demo's buttons
 * share the width: give each `style={{ flex: 1 }}`.
 */
export function DialogFooter(props: DialogFooterProps) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          gap: 8,
          paddingTop: 4,
          justifyContent: pointer ? "flex-end" : undefined,
        },
        props.style ?? null,
      ]}
    >
      {props.children}
    </View>
  );
}
