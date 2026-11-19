// An accordion: the disclosure look (`disclosureTriggerLook`, `DisclosureChevron`, `disclosurePanel`)
// at the top, and the parts that wear it below.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors } from "../../lib/theme";
import { ChevronDown, ChevronRight } from "lucide";
import type { JSX, ViewStyle } from "nsh";
import { split, View } from "nsh";
import {
  Accordion as BaseAccordion,
  AccordionHeader as BaseAccordionHeader,
  AccordionItem as BaseAccordionItem,
  AccordionPanel as BaseAccordionPanel,
  AccordionTrigger as BaseAccordionTrigger,
  type AccordionHeaderProps as BaseAccordionHeaderProps,
  type AccordionItemProps as BaseAccordionItemProps,
  type AccordionPanelProps as BaseAccordionPanelProps,
  type AccordionProps as BaseAccordionProps,
  type AccordionTriggerProps as BaseAccordionTriggerProps,
} from "nsh/base";

import { Icon } from "../../lib/icons";
import { controlSize, listRow, RowLabel, type ListRowOptions } from "../../lib/surface";
import { joinClass, labelOf } from "../../lib/utils";

/** Options of `disclosureTriggerLook`: a row's (`listRow`). */
export type DisclosureTriggerOptions = ListRowOptions;

/**
 * A trigger's props (spread them on an `AccordionTrigger`, or on the row
 * that flips a `Collapsible`): the list's row (`listRow`: its height, the
 * `accent` hover fill reaching past the content, pressed, focus and disabled
 * states; a `RowDivider` among its children above all but the first), with
 * the `group` class, so an accordion's `DisclosureChevron` turns with
 * `group-aria-expanded:`.
 */
export function disclosureTriggerLook(o?: DisclosureTriggerOptions) {
  const row = listRow(o);
  return {
    class: "group",
    get style(): ViewStyle {
      return row.style;
    },
    get hoverStyle(): ViewStyle | undefined {
      return row.hoverStyle;
    },
    get activeStyle(): ViewStyle {
      return row.activeStyle;
    },
    get focusVisibleStyle(): ViewStyle {
      return row.focusVisibleStyle;
    },
    get disabledStyle(): ViewStyle {
      return row.disabledStyle;
    },
  };
}

/** The chevron's options. */
type DisclosureChevronProps = {
  /** Its own chevron points along the row and turns down as it opens (a collapsible's). */
  open?: boolean;
  /** Follow the trigger's `aria-expanded` instead (an accordion's). */
  accordion?: boolean;
};

/**
 * The chevron at a trigger's trailing edge, muted, the size of a row's
 * icons (`controlSize.check`). A collapsible's (default) points along the
 * row and turns down as it opens (`open`), in a lane as wide as its stroke
 * (half its box), so it ends where the values below it end. An accordion's
 * (`accordion`) points down and turns up with its trigger's `aria-expanded`
 * (the trigger's `group` class), in its whole box. Both turn on a short
 * transition (200 ms in an accordion, 150 ms in a collapsible), at once with
 * reduced motion.
 */
export function DisclosureChevron(props: DisclosureChevronProps) {
  const icon = controlSize.check;
  return props.accordion ? (
    <View
      class="transition-transform duration-200 group-aria-expanded:rotate-180 motion-reduce:transition-none"
      style={{ width: icon, height: icon, alignItems: "center", justifyContent: "center" }}
    >
      <Icon icon={ChevronDown} size={icon} tint={colors.muted} />
    </View>
  ) : (
    <View
      class="transition-transform duration-150 motion-reduce:transition-none"
      style={{ width: icon / 2, alignItems: "center", rotate: props.open ? "90deg" : "0deg" }}
    >
      <Icon icon={ChevronRight} size={icon} tint={colors.muted} />
    </View>
  );
}

/** Options of `disclosurePanel`. */
export interface DisclosurePanelOptions {
  /** Room before the content: to line it up with the title, past a leading icon. */
  start?: number;
  /** The gap between its lines, default 6. */
  gap?: number;
}

/**
 * A panel's content under its trigger (a view inside an `AccordionPanel`, or
 * a `Collapsible`'s `content`): padded at the bottom, 12 points with a
 * pointer, 14 on a touch screen. The padding is the content's, not the
 * panel's: a revealed panel is zero high while closed.
 */
export function disclosurePanel(o?: DisclosurePanelOptions): ViewStyle {
  return { paddingStart: o?.start ?? 0, paddingBottom: controlSize.padding + 6, gap: o?.gap ?? 6 };
}

/** `nsh/base`'s Accordion. Every base prop passes through. */
export type AccordionProps = BaseAccordionProps;

/** One section. */
export type AccordionItemProps = BaseAccordionItemProps;

/** The heading around `AccordionTrigger`. */
export type AccordionHeaderProps = BaseAccordionHeaderProps;

/**
 * Expands the item. String children are the title; a trailing chevron is always drawn.
 * Row options (`first`, `start`) feed `disclosureTriggerLook`.
 */
export type AccordionTriggerProps = Omit<BaseAccordionTriggerProps, "children"> & {
  children?: string | JSX.Element;
  first?: boolean;
  start?: number;
};

/**
 * The open section. `reveal` defaults on; panel padding is on an inner view.
 */
export type AccordionPanelProps = BaseAccordionPanelProps & {
  /** Lines up with content past a leading icon in the trigger. */
  start?: number;
  gap?: number;
};

/** The stack of items. */
export function Accordion(props: AccordionProps) {
  return <BaseAccordion {...props} />;
}

/** One section. */
export function AccordionItem(props: AccordionItemProps) {
  const [, rest] = split(props, ["style", "children"]);
  return (
    <BaseAccordionItem {...rest} style={[{ alignSelf: "stretch" }, props.style ?? null]}>
      {props.children}
    </BaseAccordionItem>
  );
}

/** The heading around the trigger. */
export function AccordionHeader(props: AccordionHeaderProps) {
  return <BaseAccordionHeader {...props} />;
}

/** Title row with a chevron that turns as the item opens. */
export function AccordionTrigger(props: AccordionTriggerProps) {
  const [, rest] = split(props, [
    "children",
    "first",
    "start",
    "class",
    "style",
    "hoverStyle",
    "activeStyle",
    "focusVisibleStyle",
    "disabledStyle",
    "accessibilityLabel",
  ]);
  const look = disclosureTriggerLook({
    first: props.first,
    start: props.start,
  });
  const body =
    typeof props.children === "string" ? (
      <RowLabel label={props.children} strong />
    ) : (
      <View style={{ flexGrow: 1, flexShrink: 1 }}>{props.children}</View>
    );

  return (
    <BaseAccordionTrigger
      {...rest}
      class={joinClass(look.class, props.class)}
      accessibilityLabel={labelOf(props.accessibilityLabel, props.children)}
      style={[look.style, props.style ?? null]}
      hoverStyle={[look.hoverStyle ?? null, props.hoverStyle ?? null]}
      activeStyle={[look.activeStyle, props.activeStyle ?? null]}
      focusVisibleStyle={[look.focusVisibleStyle, props.focusVisibleStyle ?? null]}
      disabledStyle={[look.disabledStyle, props.disabledStyle ?? null]}
    >
      <View
        style={{ flexDirection: "row", alignItems: "center", flexGrow: 1, gap: controlSize.gap }}
      >
        {body}
        <DisclosureChevron accordion />
      </View>
    </BaseAccordionTrigger>
  );
}

/** Revealed content with `disclosurePanel` padding inside. */
export function AccordionPanel(props: AccordionPanelProps) {
  const [, rest] = split(props, ["style", "children", "reveal", "start", "gap"]);
  return (
    <BaseAccordionPanel {...rest} reveal={props.reveal ?? true} style={props.style}>
      <View style={disclosurePanel({ start: props.start, gap: props.gap })}>{props.children}</View>
    </BaseAccordionPanel>
  );
}
