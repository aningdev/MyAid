// A menu: the look (`menuItemLook`, `menuPopup`, …) and the parts that wear it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { alpha, colors, finish, terminal } from "../../lib/theme";
import { ChevronLeft, ChevronRight } from "lucide";
import type { JSX, StyleProp, TextStyle, ViewStyle } from "nsh";
import { context, platform, split, Text, token, View } from "nsh";
import {
  Menu as BaseMenu,
  MenuItem as BaseMenuItem,
  MenuSeparator as BaseMenuSeparator,
  type MenuItemProps as BaseMenuItemProps,
  type MenuProps as BaseMenuProps,
  type MenuSeparatorProps as BaseMenuSeparatorProps,
  type OpenChangeReason,
  Submenu as BaseSubmenu,
  type SubmenuProps as BaseSubmenuProps,
} from "nsh/base";

import { Button, type ButtonVariant } from "./button";
import { Icon } from "../../lib/icons";
import { labelOf } from "../../lib/label";
import { createOpenState, createSlot, type OpenState, type Slot } from "../../lib/open-state";
import { backdrop } from "../../lib/overlay";
import { MenuMark, menuIndicator, popInStyles, type PopupSide, popupSurface } from "../../lib/popup";

const pointer = platform.desktop;

/** A menu row's height, corners and type: compact with a pointer, a
 * finger's row on a touch screen. */
export interface MenuItemDimensions {
  height: number;
  radius: number;
  font: number;
  /** A note's size (a shortcut, a value). */
  note: number;
  /** A leading icon's or a check's size. */
  icon: number;
}

/** A menu row's height, corners and type: 26 points tall with a pointer, 46 on a touch screen. */
export const menuItemSize: MenuItemDimensions = pointer
  ? { height: 26, radius: 6, font: 13, note: 11.5, icon: 14 }
  : { height: 46, radius: 10, font: 16, note: 14, icon: 18 };

/** A row's inset from the popup's sides: in a terminal the popup's own padding is its Cell from the frame. */
const inset = terminal ? 0 : 8;

/** A row under the pointer or the keyboard (`hoverStyle`, `focusStyle`): a
 * flat neutral fill, the theme's `accent`. */
export const menuHighlight = (): ViewStyle => ({ backgroundColor: token("accent") });

/** A row pressed (`activeStyle`): a shade deeper than the highlight. */
export const menuPressed = (): ViewStyle => ({ backgroundColor: alpha(colors.text, 0.1) });

/** Options of `menuItemLook`. */
export interface MenuItemLookOptions {
  /** A row of two lines (a label and a note under it): as tall as they are,
   * 6 points above and below with a pointer, 10 on a touch screen, its mark
   * at the top. */
  tall?: boolean;
  /** More style (a justification, a padding), over the look's. */
  style?: ViewStyle;
}

/**
 * A menu row's props (spread them on `nsh/base`'s `MenuItem`, or on a
 * `Submenu`'s trigger): a row 8 points apart, 26 points tall with a
 * pointer and 46 on a touch screen (`menuItemSize`), 8 points in from the
 * popup's sides. Under the pointer and under the keyboard alike it takes
 * the neutral `accent` fill (`menuHighlight`), so arrow keys show where
 * they are; pressed, a shade deeper; disabled, 50%. Its label takes
 * `menuItemLabel`, a note `menuItemNote`, an icon `menuItemGlyph`.
 */
export function menuItemLook(o?: MenuItemLookOptions) {
  return {
    get style(): ViewStyle {
      return {
        flexDirection: "row",
        alignItems: o?.tall ? "flex-start" : "center",
        gap: 8,
        ...(o?.tall ? { paddingVertical: pointer ? 6 : 10 } : { height: menuItemSize.height }),
        paddingHorizontal: inset,
        borderRadius: menuItemSize.radius,
        borderCurve: "continuous",
        ...o?.style,
      };
    },
    get hoverStyle(): ViewStyle {
      return menuHighlight();
    },
    get focusStyle(): ViewStyle {
      return menuHighlight();
    },
    get activeStyle(): ViewStyle {
      return menuPressed();
    },
    disabledStyle: { opacity: 0.5 } as ViewStyle,
  };
}

/** A menu row's variants: `default`, the text's color; `destructive`, the danger tone. */
export type MenuItemVariant = "default" | "destructive";

/** Options of `menuItemLabel`, `menuItemNote` and `menuItemGlyph`. */
export interface MenuItemTextOptions {
  /** `destructive`: the danger tone on the row's label, note and icon. */
  variant?: MenuItemVariant;
}

/** A menu row's label: 13 points with a pointer, 16 on a touch screen, on one line, taking the row's free width. */
export function menuItemLabel(o?: MenuItemTextOptions): TextStyle {
  return {
    numberOfLines: 1,
    flexGrow: 1,
    flexShrink: 0,
    fontSize: menuItemSize.font,
    color: o?.variant === "destructive" ? colors.danger : colors.text,
  };
}

/** A menu row's note at its trailing edge (a shortcut, a value): 11.5 points with a pointer, 14 on a touch screen, faint (the danger tone on a destructive row). */
export function menuItemNote(o?: MenuItemTextOptions): TextStyle {
  return {
    fontSize: menuItemSize.note,
    color: o?.variant === "destructive" ? colors.danger : colors.faint,
  };
}

/** A menu row's leading icon (`<Icon {...menuItemGlyph()} />`): 14 points with a pointer, 18 on a touch screen, muted (the danger tone for a destructive item). */
export function menuItemGlyph(o?: MenuItemTextOptions) {
  return {
    size: menuItemSize.icon,
    get tint() {
      return o?.variant === "destructive" ? colors.danger : colors.muted;
    },
  };
}

/** Options of `menuPopup`. */
export interface MenuPopupOptions {
  /** The side of its trigger it opens on (its `placement`), which it comes in from: `"bottom"` unless set. */
  side?: PopupSide;
  /** With a pointer, its least width in points: 200 unless set. */
  minWidth?: number;
}

/**
 * What a menu takes besides its items (spread it on a `Menu` or a
 * `ContextMenu`; its submenus' popups take the same): with a pointer the
 * popup surface every menu shares (`popupSurface`), at least `minWidth`
 * across, coming in from the trigger's `side` (`popInStyles`: a fade, 96%
 * to full size, 4 points of slide, 150 ms); on a touch screen the sheet
 * that slides up, the card's surface with its top corners 20 points round
 * and 34 points under its rows for the home indicator; the scrim behind the
 * sheet. The surface is the popup's own box: `nsh/base` holds it to the
 * room on its side and scrolls the items inside it, so its edges and
 * shadow stay put. Its values are getters, so they follow the appearance.
 */
export function menuPopup(o?: MenuPopupOptions) {
  return {
    get popupStyle(): ViewStyle {
      return pointer
        ? { ...popupSurface(), minWidth: o?.minWidth ?? 200, ...popInStyles(o?.side).style }
        : {
            backgroundColor: colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderCurve: "continuous",
            paddingHorizontal: 10,
            paddingTop: 10,
            paddingBottom: 34,
          };
    },
    get popupStartingStyle(): ViewStyle | undefined {
      return pointer ? popInStyles(o?.side).starting : undefined;
    },
    get backdropStyle(): ViewStyle {
      return backdrop();
    },
  };
}

/** A group's title in a menu: not an item, nothing to press; 11 points semibold with a pointer, 13 on a touch screen, faint. */
export function MenuLabel(props: { text: string }) {
  return (
    <Text
      style={{
        fontSize: pointer ? 11 : 13,
        fontWeight: "600",
        color: colors.faint,
        paddingHorizontal: inset,
        paddingTop: 6,
        paddingBottom: 2,
      }}
    >
      {props.text}
    </Text>
  );
}

/** A separator between a menu's groups (`<MenuSeparator style={menuSeparator()} />`): a groove, a hairline with a lip of light under it (`finish.groove`). */
export function menuSeparator(): ViewStyle {
  return {
    height: 1,
    marginTop: 4,
    marginBottom: 5,
    marginHorizontal: 4,
    backgroundColor: colors.line,
    boxShadow: finish.groove.boxShadow,
  };
}

/**
 * The row that opens a submenu (a `Submenu`'s `trigger`): `menuItemLook`'s
 * row, `lead` (an icon) before the label and a faint chevron at its end;
 * disabled, 50%.
 */
export function SubmenuRow(props: { label: string; lead?: JSX.Element; disabled?: boolean }) {
  const look = menuItemLook();
  return (
    <View
      hoverStyle={props.disabled ? undefined : look.hoverStyle}
      focusStyle={look.focusStyle}
      activeStyle={props.disabled ? undefined : look.activeStyle}
      style={{ ...look.style, opacity: props.disabled ? 0.35 : 1 }}
    >
      {props.lead}
      <Text style={menuItemLabel()}>{props.label}</Text>
      <Icon icon={ChevronRight} size={pointer ? 12 : 14} tint={colors.faint} />
    </View>
  );
}

/** The row a touch screen's sheet shows above a submenu's items to go back (a `Submenu`'s `back`): a back chevron and the submenu's label in the accent. */
export function SubmenuBack(props: { label: string }) {
  const look = menuItemLook({ style: { gap: 6 } });
  return (
    <View activeStyle={look.activeStyle} style={look.style}>
      <Icon icon={ChevronLeft} size={14} tint={colors.accent} />
      <Text style={{ fontSize: menuItemSize.font, fontWeight: "600", color: colors.accent }}>
        {props.label}
      </Text>
    </View>
  );
}

/** The root: it owns whether the menu is open, and the trigger slot. */
export type MenuProps = {
  open?: boolean | null;
  defaultOpen?: boolean;
  children?: JSX.Element;
  onOpenChange?: (event: { open: boolean; reason: OpenChangeReason }) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
};

/**
 * The popup. Every prop of `nsh/base`'s Menu passes through but the ones the root owns;
 * `popupStyle` / `backdropStyle` / starting styles go over `menuPopup`. Defaults: placement
 * `bottom`, align `start`, offset `4`.
 */
export type MenuContentProps = Omit<
  BaseMenuProps,
  "trigger" | "open" | "defaultOpen" | "onOpenChange" | "onOpen" | "onClose" | "onCancel"
> & {
  children?: JSX.Element;
};

/** Opens the menu. String children render as a Button; otherwise a pressable View. */
export type MenuTriggerProps = {
  children?: string | JSX.Element;
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Theme layer on `nsh/base` MenuItem. A string child takes `menuItemLabel`. */
export type MenuItemProps = Omit<BaseMenuItemProps, "children"> & {
  /** `default`, the row as it is; `destructive`, its label in the danger tone. */
  variant?: MenuItemVariant;
  /** A string is the label; anything else is drawn as given. A string label is also the
   * row's name for screen readers, unless `accessibilityLabel` says otherwise. */
  children?: string | JSX.Element;
};

/** Checkbox-shaped item — sets `checked` and shows a check. */
export type MenuCheckboxItemProps = Omit<MenuItemProps, "checked"> & {
  checked?: boolean | null;
};

/** One choice of a group — `menuitemradio`, with a dot. */
export type MenuRadioItemProps = Omit<MenuItemProps, "checked"> & {
  checked?: boolean | null;
};

/** App group wrapper (not an `nsh/base` part). */
export type MenuGroupProps = {
  children?: JSX.Element;
  style?: StyleProp<ViewStyle>;
};

/** Theme layer on `nsh/base` MenuSeparator. */
export type MenuSeparatorProps = BaseMenuSeparatorProps;

/** App trailing shortcut hint (not an `nsh/base` part). */
export type MenuShortcutProps = {
  children?: string | JSX.Element;
  style?: StyleProp<TextStyle | ViewStyle>;
};

/** Composition root for a nested Submenu: trigger slot only. */
export type MenuSubProps = {
  children?: JSX.Element;
  disabled?: boolean;
};

/** Item that opens a submenu. String children get `SubmenuRow`. */
export type MenuSubTriggerProps = {
  children?: string | JSX.Element;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Nested menu body — mounts `nsh/base` Submenu with the SubTrigger slot. */
export type MenuSubContentProps = Omit<BaseSubmenuProps, "trigger" | "children"> & {
  children?: JSX.Element;
};

type MenuContextValue = OpenState & {
  trigger: Slot;
  onOpen?: () => void;
  onClose?: () => void;
  onCancel?: () => void;
};

const MenuContext = context<MenuContextValue | null>(null);

function useMenu() {
  const ctx = MenuContext();
  if (!ctx) throw new Error("Menu parts must be used within <Menu>");
  return ctx;
}

type SubContextValue = {
  trigger: Slot;
  label: { value?: string };
  disabled?: boolean;
};
const SubContext = context<SubContextValue | null>(null);

/** Composition root: owns the open state the parts below read. */
export function Menu(props: MenuProps) {
  const state = createOpenState<OpenChangeReason>(props);
  const triggerSlot = createSlot();
  return (
    <MenuContext.Provider
      value={{
        ...state,
        trigger: triggerSlot,
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
    </MenuContext.Provider>
  );
}

/** Opens the menu; a string child renders a `Button`. Base toggles on press. */
export function MenuTrigger(props: MenuTriggerProps) {
  const ctx = useMenu();
  ctx.trigger.set(() => {
    if (typeof props.children === "string") {
      return (
        <Button
          disabled={props.disabled}
          variant={props.variant ?? "secondary"}
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
        style={props.style}
      >
        {props.children}
      </View>
    );
  });
  // No layout node: a zero-size view would still take a flex `gap` in the demo row.
  return null;
}

/** The popup surface of the menu. */
export function MenuContent(props: MenuContentProps) {
  const ctx = useMenu();
  const triggerAccessor = ctx.trigger.get();
  const [, rest] = split(props, [
    "children",
    "popupStyle",
    "backdropStyle",
    "popupStartingStyle",
    "placement",
    "align",
    "offset",
  ]);
  const side = (props.placement ?? "bottom") as PopupSide;
  const chrome = menuPopup({ side });
  return (
    <BaseMenu
      {...rest}
      open={ctx.open()}
      trigger={(triggerAccessor?.() as JSX.Element) ?? <View />}
      placement={props.placement ?? "bottom"}
      align={props.align ?? "start"}
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
    </BaseMenu>
  );
}

/** One row: highlight while hovered or focused, pressed fill, dimmed when disabled. */
export function MenuItem(props: MenuItemProps) {
  const [, rest] = split(props, [
    "children",
    "variant",
    "indicator",
    "style",
    "hoverStyle",
    "focusStyle",
    "activeStyle",
    "disabledStyle",
  ]);
  const look = menuItemLook();
  return (
    <BaseMenuItem
      {...rest}
      accessibilityLabel={labelOf(props.accessibilityLabel, props.children)}
      // Read where the item is made: an item can become checkable, and its mark follows the value.
      indicatorClass={props.indicatorClass ?? (props.checked != null ? menuIndicator : undefined)}
      indicator={
        props.indicator ??
        (props.checked != null ? (
          <MenuMark
            kind={props.role === "menuitemradio" ? "dot" : "check"}
            size={menuItemSize.icon}
            tint={colors.accent}
          />
        ) : undefined)
      }
      style={[look.style, props.style ?? null]}
      hoverStyle={props.disabled ? props.hoverStyle : [look.hoverStyle, props.hoverStyle ?? null]}
      focusStyle={props.disabled ? props.focusStyle : [look.focusStyle, props.focusStyle ?? null]}
      activeStyle={
        props.disabled ? props.activeStyle : [look.activeStyle, props.activeStyle ?? null]
      }
      disabledStyle={[look.disabledStyle, props.disabledStyle ?? null]}
    >
      {typeof props.children === "string" ? (
        <Text style={menuItemLabel({ variant: props.variant })}>{props.children}</Text>
      ) : (
        props.children
      )}
    </BaseMenuItem>
  );
}

/** A menu row that can be checked. */
export function MenuCheckboxItem(props: MenuCheckboxItemProps) {
  const [, rest] = split(props, ["checked"]);
  return <MenuItem {...rest} checked={props.checked ?? false} />;
}

/** A menu row that is one choice of a group. */
export function MenuRadioItem(props: MenuRadioItemProps) {
  const [, rest] = split(props, ["checked"]);
  return <MenuItem {...rest} role="menuitemradio" checked={props.checked ?? false} />;
}

/** Groups related rows. */
export function MenuGroup(props: MenuGroupProps) {
  return <View style={props.style}>{props.children}</View>;
}

/** A hairline between groups. */
export function MenuSeparator(props: MenuSeparatorProps = {}) {
  const [, rest] = split(props, ["style"]);
  return <BaseMenuSeparator {...rest} style={[menuSeparator(), props.style ?? null]} />;
}

/** The shortcut shown at a row's trailing edge. */
export function MenuShortcut(props: MenuShortcutProps) {
  if (typeof props.children !== "string" && props.children != null) {
    return (
      <View style={[{ marginLeft: "auto" }, props.style as StyleProp<ViewStyle>]}>
        {props.children}
      </View>
    );
  }
  return (
    <Text style={[menuItemNote(), { marginLeft: "auto" }, props.style as StyleProp<TextStyle>]}>
      {props.children}
    </Text>
  );
}

/** The root of a submenu. */
export function MenuSub(props: MenuSubProps) {
  const triggerSlot = createSlot();
  const label: { value?: string } = {};
  return (
    <SubContext.Provider
      value={{
        trigger: triggerSlot,
        label,
        get disabled() {
          return props.disabled;
        },
      }}
    >
      {props.children}
    </SubContext.Provider>
  );
}

/** The row that opens a submenu. */
export function MenuSubTrigger(props: MenuSubTriggerProps) {
  const ctx = SubContext();
  if (!ctx) throw new Error("MenuSubTrigger must be used within <MenuSub>");
  ctx.trigger.set(() => {
    const children = props.children;
    const disabled = Boolean(props.disabled ?? ctx.disabled);
    ctx.label.value = typeof children === "string" ? children : undefined;
    if (typeof children === "string") {
      return <SubmenuRow label={children} disabled={disabled} />;
    }
    const look = menuItemLook();
    return (
      <View
        hoverStyle={disabled ? undefined : look.hoverStyle}
        focusStyle={look.focusStyle}
        activeStyle={disabled ? undefined : look.activeStyle}
        style={[{ ...look.style, opacity: disabled ? 0.35 : 1 }, props.style ?? null]}
      >
        {children ?? <View />}
      </View>
    );
  });
  return null;
}

/** The popup of a submenu. On a touch screen a string trigger becomes the back row. */
export function MenuSubContent(props: MenuSubContentProps) {
  const ctx = SubContext();
  if (!ctx) throw new Error("MenuSubContent must be used within <MenuSub>");
  const triggerAccessor = ctx.trigger.get();
  const [, rest] = split(props, ["children", "disabled", "back"]);
  const trigger = (triggerAccessor?.() as JSX.Element) ?? <View />;
  const name = ctx.label.value;
  const back =
    props.back !== undefined ? (
      props.back
    ) : !pointer && name ? (
      <SubmenuBack label={name} />
    ) : undefined;
  return (
    <BaseSubmenu {...rest} disabled={props.disabled ?? ctx.disabled} trigger={trigger} back={back}>
      {props.children}
    </BaseSubmenu>
  );
}
