// A button: the look (`buttonLook` and its companions) and the `Button` that wears it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import {
  alpha,
  colors,
  finish,
  focusRing,
  hovered,
  radius,
  terminal,
  TERMINAL_COLUMN,
  TERMINAL_ROW,
  tints,
} from "../../lib/theme";
import type { JSX, StyleProp, TextStyle, ViewStyle } from "nsh";
import { context, platform, split, Text, token, View } from "nsh";
import { Button as BaseButton, type ButtonProps as BaseButtonProps } from "nsh/base";

import { pressSink, pressTransition, touchSlop } from "../../lib/press";
import { labelOf, type Live, read } from "../../lib/utils";
import { Spinner } from "./spinner";

/**
 * The resting fill of a ghost control: none, bare until the pointer is over
 * it; in the terminal, which shows no hover until the pointer is there and no
 * outline to hint at one, a faint `secondary` band, so it reads as pressable.
 */
const ghostFill = () => (terminal ? token("secondary") : "transparent");

/**
 * `default`: the citrus fill, the one main action of a decision area.
 * `secondary`: a raised neutral, the ordinary visible action. `ghost`: bare
 * until the pointer is over it, a quiet toolbar or inline action.
 * `destructive`: a destructive action, the danger tone's tint, edge and
 * text, as quiet as `secondary`. shadcn's `outline` and `link` are not
 * looks of this library yet, so they are not values here.
 */
export type ButtonVariant = "default" | "secondary" | "ghost" | "destructive";

/** A button's size: 24 / 28 / 34 points with a pointer, 36 / 40 / 48 on a touch screen. */
export type ButtonSize = "sm" | "default" | "lg";

/** Options of `buttonLook`, `buttonLabel` and `buttonGlyph` (the same object for all three). */
export interface ButtonLookOptions {
  /** Default `default`. */
  size?: Live<ButtonSize | undefined>;
  /** Shown as chosen: what it opens is open (a menu's or a popover's
   * trigger), or it is the current one of a few. A raised button takes the
   * `on` fill, a ghost the neutral `accent` fill, a filled one its
   * pressed shade; no hover while selected. */
  selected?: Live<boolean | undefined>;
  /** No hover and no press feedback; dimmed to half (`disabledStyle`, shadcn's). */
  disabled?: Live<boolean | undefined>;
  /** Work started by it is going on: no hover and no press feedback, not dimmed. */
  busy?: Live<boolean | undefined>;
  /** More style (a flex, a width, a margin), over the look's. */
  style?: Live<ViewStyle | undefined>;
}

/** The sizes of a size: the height, the label's and the icon's size, the horizontal padding. */
export interface ButtonDimensions {
  height: number;
  font: number;
  icon: number;
  pad: number;
}

const pointer = platform.desktop;

/** A button's heights, label and icon sizes and paddings, by size: compact with a pointer, roomier on a touch screen. */
export const buttonSizes: Record<ButtonSize, ButtonDimensions> = pointer
  ? {
      sm: { height: 24, font: 12, icon: 12, pad: 8 },
      default: { height: 28, font: 13, icon: 14, pad: 12 },
      lg: { height: 34, font: 14, icon: 15, pad: 16 },
    }
  : {
      sm: { height: 36, font: 14, icon: 14, pad: 12 },
      default: { height: 40, font: 15, icon: 16, pad: 16 },
      lg: { height: 48, font: 17, icon: 18, pad: 20 },
    };

/** How far a press sinks a button (`activeStyle`): none with reduced motion. */
const sink = (scale: number): ViewStyle => pressSink(scale).activeStyle;

/** The properties a button's states change, eased over 150 ms: the press's
 * sink (Design Guides, "Motion") and the hover's and press's colors. */
const transition = pressTransition("background-color, border-color, box-shadow, opacity");

/** The style props a look fills: the shell writes each as its own prop, never as a
 * spread object, which is read once and keeps the appearance it was built in. */
const STYLE_KEYS = [
  "style",
  "hoverStyle",
  "activeStyle",
  "focusVisibleStyle",
  "disabledStyle",
  "hitSlop",
] as const;

const dimensions = (o?: ButtonLookOptions) => buttonSizes[read(o?.size) ?? "default"];

const filled = (variant: ButtonVariant) => variant === "default";

/** The fill, edge and shadow of a variant at rest (or selected). A disabled filled button gives up the citrus for the
 * neutral raised fill: half a lime fill reads as a muddy olive in dark, louder than the enabled buttons beside it. */
function restLook(variant: ButtonVariant, selected: boolean, disabled = false): ViewStyle {
  if (filled(variant) && disabled) return { ...finish.raised };
  if (filled(variant)) return { ...finish.accent, opacity: selected ? 0.88 : 1 };
  if (variant === "destructive") {
    return {
      boxShadow: finish.raised.boxShadow,
      backgroundColor: selected ? alpha(colors.danger, 0.2) : tints.danger,
      backgroundImage: "none",
      borderColor: alpha(colors.danger, 0.32),
    };
  }
  if (variant === "ghost")
    return {
      backgroundColor: selected ? token("accent") : ghostFill(),
      borderColor: "transparent",
    };
  // Selected stays on: `on`, apart from rest and from hover in both
  // appearances (a sunk `pressed` is a press's, too faint to hold).
  return selected ? { ...finish.on } : { ...finish.raised };
}

/**
 * A button's props (spread them: `<Button {...buttonLook("default")}>`, or
 * on a `View` with `onPress`): its style and its states. One row, its label
 * centered, `radius.control` with continuous corners; 28 points tall with a
 * pointer, 40 on a touch screen (`sm` 24 / 36, `lg` 34 / 48), a hit
 * slop making a touch target 44 points. Under the pointer a raised button
 * lightens, a ghost gets a whisper of the text color, a filled one a touch
 * of transparency; pressed it sinks to 97% (none with reduced motion) and
 * shades (a raised button's inner shade, a filled one dims). Keyboard
 * focus: `focusRing()`. Disabled: half opacity, no hover or press (a filled one on the raised fill, its label muted). Pair it with
 * `buttonLabel` for the label and `buttonGlyph` for an icon.
 */
export function buttonLook(variant: Live<ButtonVariant> = "secondary", o?: ButtonLookOptions) {
  const v = () => read(variant) ?? "secondary";
  const idle = () => !!read(o?.disabled) || !!read(o?.busy);
  return {
    get style(): ViewStyle {
      const dims = dimensions(o);
      return {
        height: terminal ? TERMINAL_ROW : dims.height,
        paddingHorizontal: terminal ? TERMINAL_COLUMN : dims.pad,
        borderRadius: radius.control,
        borderCurve: "continuous",
        borderWidth: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: pointer ? 6 : 8,
        ...restLook(v(), !!read(o?.selected), !!read(o?.disabled)),
        ...transition,
        ...read(o?.style),
      };
    },
    get hoverStyle(): ViewStyle | undefined {
      if (idle() || read(o?.selected)) return undefined;
      const variant = v();
      if (filled(variant)) return { opacity: 0.94 };
      if (variant === "destructive") return { backgroundColor: alpha(colors.danger, 0.16) };
      return variant === "ghost" ? hovered() : { ...finish.hover };
    },
    get activeStyle(): ViewStyle | undefined {
      if (idle()) return undefined;
      const variant = v();
      const shade: ViewStyle = filled(variant)
        ? { opacity: 0.88 }
        : variant === "destructive"
          ? { backgroundColor: alpha(colors.danger, 0.22), boxShadow: "none" }
          : { ...finish.pressed };
      return { ...shade, ...sink(0.97) };
    },
    get focusVisibleStyle(): ViewStyle {
      return focusRing();
    },
    disabledStyle: { opacity: 0.5 },
    get hitSlop(): number | undefined {
      return touchSlop(dimensions(o).height);
    },
  };
}

/** The color of a variant's label and icon; a disabled filled button's, on the neutral fill, is muted. */
function ink(live: Live<ButtonVariant>, disabled = false) {
  const variant = read(live) ?? "secondary";
  if (filled(variant) && disabled) return colors.muted;
  return filled(variant)
    ? colors.onAccent
    : variant === "destructive"
      ? colors.danger
      : colors.text;
}

/** The label of a `buttonLook` of the same variant and options: 13 points with a pointer, 15 on a touch screen (`sm` 12 / 14, `lg` 14 / 17), medium weight. */
export function buttonLabel(
  variant: Live<ButtonVariant> = "secondary",
  o?: ButtonLookOptions,
): TextStyle {
  return {
    get color() {
      return ink(variant, !!read(o?.disabled));
    },
    get fontSize() {
      return dimensions(o).font;
    },
    fontWeight: "500",
  };
}

/** An icon beside the label of a `buttonLook` (`<Icon {...buttonGlyph(..)} />`): its size and color. */
export function buttonGlyph(variant: Live<ButtonVariant> = "secondary", o?: ButtonLookOptions) {
  return {
    get size() {
      return dimensions(o).icon;
    },
    get tint() {
      return ink(variant, !!read(o?.disabled));
    },
  };
}

/** An icon-only button's variants: `ghost` bare until the pointer is over it, `secondary` raised, `destructive` a dangerous action's. */
export type IconButtonVariant = "ghost" | "secondary" | "destructive";

/** Options of `iconButtonLook` and `iconButtonGlyph`. */
export interface IconButtonLookOptions {
  /** Chosen (a favorite, a shown sidebar): the accent's tint, the icon in the accent, no hover. */
  selected?: Live<boolean | undefined>;
  /** `ghost` (default): bare until the pointer is over it; `secondary`: raised; `destructive`: its icon in the danger tone, the tone's tint under the pointer. */
  variant?: IconButtonVariant;
  /** Default `default`: a square as high as a button of that size. */
  size?: Live<ButtonSize | undefined>;
  /** No hover and no press feedback; dimmed to half. */
  disabled?: Live<boolean | undefined>;
}

/** The side of an icon-only button: the height of a button of its size (28 with a pointer, 40 on a touch screen, at `default`). */
const iconButtonSide = (o?: IconButtonLookOptions) =>
  buttonSizes[read(o?.size) ?? "default"].height;

/** The icon of an icon-only button: 15 points on the `default` 28 with a pointer, 18 on a touch screen's 40, a step either side. */
const iconButtonGlyphSizes: Record<ButtonSize, number> = pointer
  ? { sm: 13, default: 15, lg: 17 }
  : { sm: 16, default: 18, lg: 20 };

/**
 * An icon-only button's props (spread them on a `Button` or a `View` with
 * `onPress`): a square of 28 points with a pointer, 40 on a touch screen
 * (a hit slop making 44), `radius.control`; `size` takes the heights of
 * `buttonSizes` (24 / 34 with a pointer). A ghost by default, raised as
 * `secondary`, the danger tone's under the pointer as `destructive`; `selected`
 * takes the accent's tint. Pressed it sinks to 90% (none with reduced
 * motion). The terminal sizes it to its label.
 */
export function iconButtonLook(o: IconButtonLookOptions = {}) {
  const raised = o.variant === "secondary";
  const destructive = o.variant === "destructive";
  return {
    get style(): ViewStyle {
      const selected = !!read(o.selected);
      const side = iconButtonSide(o);
      return {
        width: terminal ? undefined : side,
        height: terminal ? undefined : side,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.control,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: "transparent",
        backgroundColor: selected ? tints.accent : ghostFill(),
        ...(raised && !selected ? finish.raised : {}),
        ...transition,
      };
    },
    get hoverStyle(): ViewStyle | undefined {
      if (read(o.selected) || read(o.disabled)) return undefined;
      return destructive
        ? { backgroundColor: tints.danger }
        : raised
          ? { ...finish.hover }
          : hovered();
    },
    get activeStyle(): ViewStyle | undefined {
      if (read(o.disabled)) return undefined;
      return {
        ...(raised ? finish.pressed : { backgroundColor: alpha(colors.text, 0.1) }),
        ...sink(0.9),
      };
    },
    get focusVisibleStyle(): ViewStyle {
      return focusRing();
    },
    disabledStyle: { opacity: 0.5 },
    get hitSlop(): number | undefined {
      return touchSlop(iconButtonSide(o));
    },
  };
}

/** The icon of an `iconButtonLook` of the same options: 15 points with a pointer, 18 on a touch screen (`sm` and `lg` a step either side); the accent when `selected`, else the variant's (the danger tone's, the text's raised, muted bare). */
export function iconButtonGlyph(o: IconButtonLookOptions = {}) {
  return {
    get size() {
      return iconButtonGlyphSizes[read(o.size) ?? "default"];
    },
    get tint() {
      return read(o.selected)
        ? colors.accent
        : o.variant === "destructive"
          ? colors.danger
          : o.variant === "secondary"
            ? colors.text
            : colors.muted;
    },
  };
}

/** A round icon button's variants: `default` the citrus fill, `secondary` raised. */
export type RoundButtonVariant = "default" | "secondary";

/** Options of `roundButtonLook` and `roundButtonGlyph`. */
export interface RoundButtonLookOptions {
  /** Default `default`: the diameter is a button's height at that size (28 with a pointer, 40 on a touch screen). */
  size?: ButtonSize;
  /** The diameter in points, over the scale: geometry, where a scale would be off. */
  side?: number;
  /** No hover and no press feedback; dimmed to half. */
  disabled?: Live<boolean | undefined>;
}

/** The diameter of a round button: `side` if given, else a button's height at `size`. */
const roundSide = (o?: RoundButtonLookOptions) =>
  o?.side ?? buttonSizes[o?.size ?? "default"].height;

/**
 * A round icon button's props (a composer's send, a player's play):
 * `default` the citrus fill, `secondary` raised; `size` across (28 with a
 * pointer, 40 on a touch screen, a hit slop making 44), or `side` points
 * across exactly. Under the pointer it lightens; pressed it sinks to 92%
 * (none with reduced motion).
 */
export function roundButtonLook(
  variant: RoundButtonVariant = "default",
  o: RoundButtonLookOptions = {},
) {
  const primary = variant === "default";
  return {
    get style(): ViewStyle {
      const side = roundSide(o);
      return {
        width: side,
        height: side,
        borderRadius: side / 2,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        ...(primary ? finish.accent : finish.raised),
        ...transition,
      };
    },
    get hoverStyle(): ViewStyle | undefined {
      if (read(o.disabled)) return undefined;
      return primary ? { opacity: 0.94 } : { ...finish.hover };
    },
    get activeStyle(): ViewStyle | undefined {
      return read(o.disabled) ? undefined : sink(0.92);
    },
    get focusVisibleStyle(): ViewStyle {
      return focusRing();
    },
    disabledStyle: { opacity: 0.5 },
    get hitSlop(): number | undefined {
      return touchSlop(roundSide(o));
    },
  };
}

/** How much of a round button's diameter its icon takes. */
const ROUND_GLYPH_RATIO = 0.42;

/** The icon of a `roundButtonLook` of the same options: 42% of its diameter, on the fill's color. */
export function roundButtonGlyph(
  variant: RoundButtonVariant = "default",
  o?: RoundButtonLookOptions,
) {
  return {
    size: roundSide(o) * ROUND_GLYPH_RATIO,
    get tint() {
      return variant === "default" ? colors.onLight : colors.text;
    },
  };
}

/** Options of `splitButtonLook`'s halves. */
export interface SplitSegmentOptions {
  /** Shaded as pressed while what it opens is open (the menu half's menu). */
  selected?: Live<boolean | undefined>;
  /** No hover and no press feedback. */
  disabled?: Live<boolean | undefined>;
  /** More style (a width, a padding), over the look's. */
  style?: Live<ViewStyle | undefined>;
}

/**
 * A split button: a main action and the menu of its variants in one
 * silhouette of a variant's finish (`frame`, a row clipping its halves), the
 * two halves (`segment()`, each a pressable with its own hover, press and
 * focus) and the hairline between them (`divider`). A half carries no fill
 * of its own: under the pointer it takes a whisper of the label's color, a
 * deeper one pressed or while its menu is open, so the pair keeps one
 * fill. The frame and the halves are a `buttonLook` of the same variant and
 * size; the label and icons take `buttonLabel` / `buttonGlyph`.
 */
export function splitButtonLook(variant: Live<ButtonVariant> = "default", o?: ButtonLookOptions) {
  const shade = (a: number) => alpha(ink(variant), a);
  return {
    frame: {
      get style(): ViewStyle {
        return {
          flexDirection: "row",
          alignItems: "stretch",
          borderRadius: radius.control,
          borderCurve: "continuous",
          borderWidth: 1,
          overflow: "hidden",
          ...restLook(read(variant) ?? "default", false),
          ...transition,
          ...read(o?.style),
        };
      },
    },
    segment(s?: SplitSegmentOptions) {
      return {
        get style(): ViewStyle {
          const dims = dimensions(o);
          return {
            height: terminal ? TERMINAL_ROW : dims.height,
            paddingHorizontal: terminal ? TERMINAL_COLUMN : dims.pad,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: pointer ? 6 : 8,
            backgroundColor: read(s?.selected) ? shade(0.12) : "transparent",
            ...transition,
            ...read(s?.style),
          };
        },
        get hoverStyle(): ViewStyle | undefined {
          return read(s?.disabled) || read(s?.selected)
            ? undefined
            : { backgroundColor: shade(0.06) };
        },
        get activeStyle(): ViewStyle | undefined {
          return read(s?.disabled) ? undefined : { backgroundColor: shade(0.12) };
        },
        get focusVisibleStyle(): ViewStyle {
          return focusRing(-2);
        },
        disabledStyle: { opacity: 0.5 },
        // Taller only: the halves touch, so a finger's slop stays off their shared edge.
        get hitSlop() {
          const v = touchSlop(dimensions(o).height);
          return v ? { top: v, bottom: v } : undefined;
        },
      };
    },
    get divider(): ViewStyle {
      return { width: 1, backgroundColor: shade(0.22) };
    },
  };
}

/**
 * `nsh/base`'s Button in the look of `buttonLook`. Every base prop passes through; the style
 * props (`style`, `hoverStyle`, `activeStyle`, `focusVisibleStyle`, `disabledStyle`) go over the look's.
 */
export type ButtonProps = Omit<BaseButtonProps, "children"> & {
  /** Default `default`, the citrus fill: the main action. */
  variant?: ButtonVariant;
  /** Default `default`. */
  size?: ButtonSize;
  /** Work started by it is going on: a spinner before the label, no presses, not dimmed. */
  busy?: boolean;
  /**
   * A string is the label, in `buttonLabel`'s type; anything else is drawn as given. A string
   * label is also the button's name for screen readers, unless `accessibilityLabel` says
   * otherwise; children drawn as given derive nothing.
   */
  children?: string | JSX.Element;
};

/** A button of a `variant` and a `size`. `selected` (a base prop) shows it as chosen. */
export function Button(props: ButtonProps) {
  const [, rest] = split(props, [...STYLE_KEYS, "variant", "size", "busy", "children", "onPress"]);
  const variant = () => props.variant ?? "default";
  const options: ButtonLookOptions = {
    size: () => props.size,
    selected: () => props.selected,
    disabled: () => props.disabled,
    busy: () => props.busy,
  };
  const look = buttonLook(variant, options);
  return (
    <BaseButton
      {...rest}
      accessibilityLabel={labelOf(props.accessibilityLabel, props.children)}
      // Busy, it keeps its focus and its look and takes no second press.
      onPress={() => !props.busy && props.onPress?.()}
      hitSlop={props.hitSlop ?? look.hitSlop}
      style={[look.style, props.style ?? null]}
      hoverStyle={[look.hoverStyle ?? null, props.hoverStyle ?? null]}
      activeStyle={[look.activeStyle ?? null, props.activeStyle ?? null]}
      focusVisibleStyle={[look.focusVisibleStyle, props.focusVisibleStyle ?? null]}
      disabledStyle={[look.disabledStyle, props.disabledStyle ?? null]}
    >
      <If when={props.busy}>
        <Spinner {...buttonGlyph(variant, options)} />
      </If>
      {typeof props.children === "string" ? (
        <Text style={buttonLabel(variant, options)}>{props.children}</Text>
      ) : (
        props.children
      )}
    </BaseButton>
  );
}

/**
 * An icon-only button in the look of `iconButtonLook`. Every base prop passes through; the style
 * props go over the look's. Pass an icon (or any content) as `children`; `iconButtonGlyph` sizes it.
 */
export type IconButtonProps = Omit<BaseButtonProps, "children" | "accessibilityLabel"> & {
  /** Default `ghost`: bare until the pointer is over it; `secondary`: raised; `destructive`: a dangerous action's. */
  variant?: IconButtonVariant;
  /** Default `default`: a square as high as a button of that size. */
  size?: ButtonSize;
  /**
   * What screen readers say. Required: an icon alone has no text to name it, so there is no
   * name to derive.
   */
  accessibilityLabel: string;
  children?: JSX.Element;
};

/** A square icon button. `selected` (a base prop) shows it as chosen. */
export function IconButton(props: IconButtonProps) {
  const [, rest] = split(props, [...STYLE_KEYS, "variant", "size", "children"]);
  const options: IconButtonLookOptions = {
    selected: () => props.selected,
    variant: props.variant,
    size: () => props.size,
    disabled: () => props.disabled,
  };
  const look = iconButtonLook(options);
  return (
    <BaseButton
      {...rest}
      hitSlop={props.hitSlop ?? look.hitSlop}
      style={[look.style, props.style ?? null]}
      hoverStyle={[look.hoverStyle ?? null, props.hoverStyle ?? null]}
      activeStyle={[look.activeStyle ?? null, props.activeStyle ?? null]}
      focusVisibleStyle={[look.focusVisibleStyle, props.focusVisibleStyle ?? null]}
      disabledStyle={[look.disabledStyle, props.disabledStyle ?? null]}
    >
      {props.children}
    </BaseButton>
  );
}

/**
 * A round icon button in the look of `roundButtonLook`. Every base prop passes through; the style
 * props go over the look's. Pass an icon as `children`; `roundButtonGlyph` sizes and tints it.
 */
export type RoundButtonProps = Omit<BaseButtonProps, "children" | "accessibilityLabel"> & {
  /** Default `default`, the citrus fill; `secondary` raised. */
  variant?: RoundButtonVariant;
  /** Default `default`: the diameter is a button's height at that size (28 with a pointer, 40 on a touch screen). */
  size?: ButtonSize;
  /** The diameter in points, over the scale. */
  side?: number;
  /**
   * What screen readers say. Required: an icon alone has no text to name it, so there is no
   * name to derive.
   */
  accessibilityLabel: string;
  children?: JSX.Element;
};

/** A round icon button of a `variant`, a `size` or a `side`. */
export function RoundButton(props: RoundButtonProps) {
  const [, rest] = split(props, [...STYLE_KEYS, "variant", "size", "side", "children"]);
  const variant = props.variant ?? "default";
  const options: RoundButtonLookOptions = {
    size: props.size,
    side: props.side,
    disabled: () => props.disabled,
  };
  const look = roundButtonLook(variant, options);
  return (
    <BaseButton
      {...rest}
      hitSlop={props.hitSlop ?? look.hitSlop}
      style={[look.style, props.style ?? null]}
      hoverStyle={[look.hoverStyle ?? null, props.hoverStyle ?? null]}
      activeStyle={[look.activeStyle ?? null, props.activeStyle ?? null]}
      focusVisibleStyle={[look.focusVisibleStyle, props.focusVisibleStyle ?? null]}
      disabledStyle={[look.disabledStyle, props.disabledStyle ?? null]}
    >
      {props.children}
    </BaseButton>
  );
}

type SplitContextValue = {
  look: ReturnType<typeof splitButtonLook>;
  variant: () => ButtonVariant;
  options: ButtonLookOptions;
};

const SplitContext = context<SplitContextValue | null>(null);

function useSplit() {
  const ctx = SplitContext();
  if (!ctx) throw new Error("SplitButton parts must be used within <SplitButton>");
  return ctx;
}

/** The frame of a split button: a main action and a menu half in one silhouette. */
export type SplitButtonProps = {
  /** Default `default`. */
  variant?: ButtonVariant;
  /** Default `default`. */
  size?: ButtonSize;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: JSX.Element;
};

/**
 * One half of a split button. A string child is the label in `buttonLabel`; anything else is
 * drawn as given. Spread `buttonGlyph` on an icon for the menu half.
 */
export type SplitButtonSegmentProps = Omit<BaseButtonProps, "children"> & {
  children?: string | JSX.Element;
};

/** The hairline between the two halves. */
export type SplitButtonDividerProps = {
  style?: StyleProp<ViewStyle>;
};

/** The frame that clips the two halves of a split button. */
export function SplitButton(props: SplitButtonProps) {
  const variant = () => props.variant ?? "default";
  const options: ButtonLookOptions = {
    size: () => props.size,
    disabled: () => props.disabled,
  };
  const look = splitButtonLook(variant, options);
  return (
    <SplitContext.Provider value={{ look, variant, options }}>
      <View style={[look.frame.style, props.style ?? null]}>{props.children}</View>
    </SplitContext.Provider>
  );
}

/** A pressable half of a `SplitButton`. */
export function SplitButtonSegment(props: SplitButtonSegmentProps) {
  const ctx = useSplit();
  const [, rest] = split(props, [...STYLE_KEYS, "children"]);
  const segment = ctx.look.segment({
    selected: () => props.selected,
    disabled: () => props.disabled,
  });
  return (
    <BaseButton
      {...rest}
      accessibilityLabel={labelOf(props.accessibilityLabel, props.children)}
      hitSlop={props.hitSlop ?? segment.hitSlop}
      style={[segment.style, props.style ?? null]}
      hoverStyle={[segment.hoverStyle ?? null, props.hoverStyle ?? null]}
      activeStyle={[segment.activeStyle ?? null, props.activeStyle ?? null]}
      focusVisibleStyle={[segment.focusVisibleStyle, props.focusVisibleStyle ?? null]}
      disabledStyle={[segment.disabledStyle, props.disabledStyle ?? null]}
    >
      {typeof props.children === "string" ? (
        <Text style={buttonLabel(ctx.variant, ctx.options)}>{props.children}</Text>
      ) : (
        props.children
      )}
    </BaseButton>
  );
}

/** The hairline between a split button's halves. */
export function SplitButtonDivider(props: SplitButtonDividerProps = {}) {
  const ctx = useSplit();
  return <View style={[ctx.look.divider, props.style ?? null]} />;
}

/** What a trigger's action takes: a string child wears the button, anything else presses where it is. */
export interface ActionProps {
  children?: string | JSX.Element;
  /** The button's variant, for a string child (default `secondary`). */
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Runs when it is pressed; a disabled one does not. */
  onPress: () => void;
}

/**
 * A trigger's action: a string presses as a `Button` of its variant; anything else (an icon, a
 * glyph of its own) presses where it lies, in a view a screen reader still calls a button and the
 * keyboard still rings.
 */
export function Action(props: ActionProps) {
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
      focusVisibleStyle={focusRing()}
      onPress={props.disabled ? undefined : props.onPress}
      style={props.style}
    >
      {props.children}
    </View>
  );
}
