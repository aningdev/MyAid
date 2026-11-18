// A context menu: `nsh/base`'s ContextMenu with the shared menu look from `menu.tsx`.
// This file is the shell only; row and popup looks live in `menu.tsx`.
import type { JSX, StyleProp, ViewStyle } from "nsh";
import { context, split, View } from "nsh";
import {
  ContextMenu as BaseContextMenu,
  type ContextMenuProps as BaseContextMenuProps,
  type OpenChangeReason,
} from "nsh/base";

import { createOpenState, createSlot, type OpenState, type Slot } from "../../lib/open-state";
import { menuPopup } from "./menu";

/** Why a context menu closed (`onOpenChange`'s `reason`): `nsh/base`'s `OpenChangeReason`, under this part's name. */
export type ContextMenuOpenChangeReason = OpenChangeReason;

/** The root: it owns whether the menu is open, and the trigger slot. */
export type ContextMenuProps = {
  open?: boolean | null;
  defaultOpen?: boolean;
  disabled?: boolean;
  children?: JSX.Element;
  onOpenChange?: (event: { open: boolean; reason: ContextMenuOpenChangeReason }) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
};

/** The popup: `nsh/base`'s ContextMenu, showing the shared menu look (`menuPopup`) 4 points from the pointer unless set. */
export type ContextMenuContentProps = Omit<
  BaseContextMenuProps,
  "trigger" | "open" | "disabled" | "onOpenChange" | "onOpen" | "onClose" | "onCancel" | "children"
> & {
  children?: JSX.Element;
};

/** The area that opens the menu, at the pointer (a secondary click or a long press). */
export type ContextMenuTriggerProps = {
  children?: JSX.Element;
  style?: StyleProp<ViewStyle>;
};

type ContextMenuContextValue = OpenState & {
  trigger: Slot<JSX.Element>;
  disabled?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
};

const ContextMenuContext = context<ContextMenuContextValue | null>(null);

function useContextMenu() {
  const ctx = ContextMenuContext();
  if (!ctx) throw new Error("ContextMenu parts must be used within <ContextMenu>");
  return ctx;
}

/** Composition root: a menu opened at the pointer. */
export function ContextMenu(props: ContextMenuProps) {
  const state = createOpenState<OpenChangeReason>(props);
  const triggerSlot = createSlot<JSX.Element>();
  return (
    <ContextMenuContext.Provider
      value={{
        ...state,
        trigger: triggerSlot,
        get disabled() {
          return props.disabled;
        },
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
    </ContextMenuContext.Provider>
  );
}

/** The area that opens the menu: its children in a `View` when it has a `style`, as given otherwise. */
export function ContextMenuTrigger(props: ContextMenuTriggerProps) {
  const ctx = useContextMenu();
  ctx.trigger.set(() => {
    if (props.style != null) {
      return <View style={props.style}>{props.children ?? <View />}</View>;
    }
    return props.children ?? <View />;
  });
  // No layout node: a zero-size view would still take a flex `gap` in a row of triggers.
  return null;
}

/** The popup surface, reusing the menu look. */
export function ContextMenuContent(props: ContextMenuContentProps) {
  const ctx = useContextMenu();
  const triggerAccessor = ctx.trigger.get();
  const [, rest] = split(props, [
    "children",
    "popupStyle",
    "backdropStyle",
    "popupStartingStyle",
    "offset",
  ]);
  const chrome = menuPopup();
  return (
    <BaseContextMenu
      {...rest}
      open={ctx.open()}
      disabled={ctx.disabled}
      trigger={triggerAccessor?.() ?? <View />}
      offset={props.offset ?? 4}
      onOpenChange={({ open, reason }) => ctx.setOpen(open, reason)}
      onOpen={ctx.onOpen}
      onClose={ctx.onClose}
      onCancel={ctx.onCancel}
      popupStyle={[chrome.popupStyle, props.popupStyle ?? null]}
      backdropStyle={[chrome.backdropStyle, props.backdropStyle ?? null]}
      popupStartingStyle={
        props.popupStartingStyle !== undefined
          ? props.popupStartingStyle
          : chrome.popupStartingStyle
      }
    >
      {props.children}
    </BaseContextMenu>
  );
}

/**
 * A context menu's rows, its groups, its submenus and its notes are the menu's own: `menu.tsx`
 * draws them, so a row of a context menu wears what a row of a menu wears.
 */
export {
  MenuCheckboxItem as ContextMenuCheckboxItem,
  MenuGroup as ContextMenuGroup,
  MenuItem as ContextMenuItem,
  MenuLabel as ContextMenuLabel,
  MenuRadioItem as ContextMenuRadioItem,
  MenuSeparator as ContextMenuSeparator,
  MenuShortcut as ContextMenuShortcut,
  MenuSub as ContextMenuSub,
  MenuSubContent as ContextMenuSubContent,
  MenuSubTrigger as ContextMenuSubTrigger,
  type MenuCheckboxItemProps as ContextMenuCheckboxItemProps,
  type MenuGroupProps as ContextMenuGroupProps,
  type MenuItemProps as ContextMenuItemProps,
  type MenuItemVariant as ContextMenuItemVariant,
  type MenuLabelProps as ContextMenuLabelProps,
  type MenuRadioItemProps as ContextMenuRadioItemProps,
  type MenuSeparatorProps as ContextMenuSeparatorProps,
  type MenuShortcutProps as ContextMenuShortcutProps,
  type MenuSubContentProps as ContextMenuSubContentProps,
  type MenuSubProps as ContextMenuSubProps,
  type MenuSubTriggerProps as ContextMenuSubTriggerProps,
} from "./menu";
