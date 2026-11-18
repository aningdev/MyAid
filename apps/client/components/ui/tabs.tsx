// Tabs: the looks (`tabsLook`, `underlineTabsLook`, `TabTitle`) and the parts that wear them.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import {
  colors,
  finish,
  focusRing,
  follow,
  hovered,
  motion,
  radius,
  terminal,
} from "../../lib/theme";
import type { IconNode } from "lucide";
import type { JSX, StyleProp, ViewStyle } from "nsh";
import { computed, context, signal, split, Text, View } from "nsh";
import {
  Tab as BaseTab,
  Tabs as BaseTabs,
  type TabProps as BaseTabProps,
  type TabsProps as BaseTabsProps,
} from "nsh/base";

import { Icon } from "../../lib/icons";
import { controlSize } from "../../lib/surface";
import { labelOf, type Live, read } from "../../lib/utils";


/** The state of one tab or segment, read where the look is applied. */
export interface TabState {
  selected: Live<boolean | undefined>;
  disabled?: Live<boolean | undefined>;
}

/** The props a tab's or segment's look gives it (a `Tab`, a `Radio`). */
export interface TabLook {
  readonly style: ViewStyle;
  readonly hoverStyle: ViewStyle | undefined;
  readonly activeStyle?: ViewStyle;
  readonly focusVisibleStyle: ViewStyle;
  readonly disabledStyle: ViewStyle;
}

/** Under the pointer, a tab that is neither selected (its thumb shows) nor disabled. */
const hoverOf = (state: TabState) =>
  read(state.selected) || read(state.disabled) ? undefined : hovered();

/**
 * A tab strip's look, the gallery's section switcher: a capsule track
 * `controlSize.tabs` high (30 with a pointer, 40 on a touch screen), sunk
 * into the surface with a hairline edge, the tabs sharing its width; the
 * selected tab's pill (`indicatorStyle`, `finish.thumb`) springs to the next
 * one natively. `tab(state)`: a tab's props (hover on the others, the focus
 * ring, dimmed while disabled). Pair each tab with a `TabTitle`.
 */
export function tabsLook() {
  // The track's padding and border: a tab is a pill inside them.
  const inset = 3;
  const inner = controlSize.tabs - 2 * (inset + 1);
  return {
    get style(): ViewStyle {
      return {
        height: controlSize.tabs,
        flexDirection: "row",
        gap: 2,
        padding: inset,
        borderRadius: controlSize.tabs / 2,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.inset,
        boxShadow: finish.track.boxShadow,
      };
    },
    get indicatorStyle(): ViewStyle {
      return {
        top: inset,
        bottom: inset,
        borderRadius: inner / 2,
        borderWidth: 1,
        ...finish.thumb,
      };
    },
    tab(state: TabState): TabLook {
      return {
        style: {
          flex: 1,
          paddingHorizontal: 6,
          borderRadius: inner / 2,
          borderWidth: 1,
          borderColor: "transparent",
          alignItems: "center",
          justifyContent: "center",
        },
        get hoverStyle() {
          return hoverOf(state);
        },
        get focusVisibleStyle() {
          return focusRing();
        },
        disabledStyle: { opacity: 0.5 },
      };
    },
  };
}

/**
 * An underlined tab strip's look: tabs as wide as their labels
 * (`controlSize.tabs` high), a 2-point accent line (`indicatorStyle`) at the
 * strip's bottom that travels and stretches to the selected tab, over a
 * hairline (`rule`, a view under the strip: outside a scroll view holding
 * it, so its clipping never cuts the line). `tab(state)`: a tab's props
 * (hover on the others, a press that dims, the focus ring, dimmed while
 * disabled).
 */
export function underlineTabsLook() {
  return {
    get style(): ViewStyle {
      return { flexDirection: "row", gap: 2, paddingTop: 3 };
    },
    get indicatorStyle(): ViewStyle {
      return { bottom: 0, height: 2, borderRadius: 1, backgroundColor: colors.accent };
    },
    get rule(): ViewStyle {
      return {
        pointerEvents: "none",
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 1,
        backgroundColor: colors.line,
      };
    },
    tab(state: TabState): TabLook {
      return {
        get style(): ViewStyle {
          return {
            height: controlSize.tabs,
            paddingHorizontal: 8,
            marginBottom: 4,
            borderRadius: radius.control,
            borderWidth: 1,
            borderColor: "transparent",
            justifyContent: "center",
          };
        },
        get hoverStyle() {
          return hoverOf(state);
        },
        activeStyle: { opacity: 0.7 },
        get focusVisibleStyle() {
          return focusRing();
        },
        disabledStyle: { opacity: 0.5 },
      };
    },
  };
}

/** A tab title's icon: 14 points square. */
const TAB_ICON = 14;

/** The room a tab title's icon takes: the icon and the gap after it. */
export const TAB_ICON_ROOM = TAB_ICON + 6;

/**
 * A tab's label (and icon, and a count in a capsule): the text color while
 * selected, fading in as the indicator arrives (`motion.move`), the icon's
 * two tints crossing over. It keeps its natural width (never truncated) and
 * reports it without the icon (`onWidth`): the same whether the icon shows
 * or not, so a row deciding on its icons by it never flips back.
 * `underline`: a terminal marks the selected tab of an underlined strip by
 * underlining its label, where the strip's indicator, thinner than a Cell,
 * does not show.
 */
export function TabTitle(props: {
  name: string;
  selected: boolean;
  count?: number;
  icon?: IconNode;
  underline?: boolean;
  onWidth?: (bare: number) => void;
}) {
  const on = follow(() => (props.selected ? 1 : 0), motion.move);
  const away = on.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <View
      onLayout={({ bounds }) =>
        props.onWidth?.(bounds.size.width - (props.icon ? TAB_ICON_ROOM : 0))
      }
      style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 }}
    >
      <If when={props.icon}>
        <View style={{ width: TAB_ICON, height: TAB_ICON }}>
          <View style={{ position: "absolute", opacity: away }}>
            <Icon icon={props.icon!} size={TAB_ICON} tint={colors.muted} />
          </View>
          <View style={{ position: "absolute", opacity: on }}>
            <Icon icon={props.icon!} size={TAB_ICON} tint={colors.text} />
          </View>
        </View>
      </If>
      <Text
        style={{
          numberOfLines: 1,
          fontSize: 13,
          fontWeight: "500",
          color: on.interpolate({ inputRange: [0, 1], outputRange: [colors.muted, colors.text] }),
          textDecorationLine: terminal && props.underline && props.selected ? "underline" : "none",
        }}
      >
        {props.name}
      </Text>
      <If when={props.count !== undefined}>
        <View
          style={{
            minWidth: 18,
            height: 16,
            paddingHorizontal: 5,
            // A pill: two points inside the inset's corners, which is half this box in the
            // default theme (`radius` 10).
            borderRadius: radius.inset - 2,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.inset,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "600",
              color: colors.muted,
              fontVariant: ["tabular-nums"],
            }}
          >
            {props.count}
          </Text>
        </View>
      </If>
    </View>
  );
}

/** Pill track (`default`) or underlined (`line`) tab list. */
export type TabsListVariant = "default" | "line";

/**
 * Composition root: the selected tab value, then lists and panels. `nsh/base`
 * has no value-holding root — the list is {@link TabsList}.
 */
export type TabsProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  children?: JSX.Element;
  class?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** `nsh/base`'s Tabs (the tablist). Base props pass through. */
export type TabsListProps = BaseTabsProps & {
  variant?: TabsListVariant;
};

/** A tab in the list. String children become the label. */
export type TabsTriggerProps = Omit<BaseTabProps, "selected" | "children"> & {
  value: string;
  children?: string | JSX.Element;
};

/** Panel for one `value`. Hidden while another value is selected. */
export type TabsContentProps = {
  value: string;
  children?: JSX.Element;
  class?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** `nsh/base`'s Tab with the same chrome, when the app owns `selected`. */
export type TabProps = Omit<BaseTabProps, "children"> & {
  children?: string | JSX.Element;
};

type TabsContextValue = {
  value: () => string;
  onValueChange: (value: string) => void;
  orientation: () => "horizontal" | "vertical";
};

const TabsContext = context<TabsContextValue | null>(null);
const ListVariantContext = context<TabsListVariant>("default");

function useTabs() {
  return TabsContext();
}

/** Composition root: selected value, then list and content. */
export function Tabs(props: TabsProps) {
  const [, rest] = split(props, [
    "value",
    "defaultValue",
    "onValueChange",
    "orientation",
    "children",
    "class",
    "style",
  ]);
  const uncontrolled = signal(props.value ?? props.defaultValue ?? "");
  const value = () => (props.value != null ? props.value : uncontrolled());
  const orientation = () => props.orientation ?? "horizontal";

  return (
    <TabsContext.Provider
      value={{
        value,
        orientation,
        onValueChange: (next) => {
          if (props.value == null) uncontrolled.set(next);
          props.onValueChange?.(next);
        },
      }}
    >
      <View
        {...rest}
        class={props.class ?? undefined}
        style={[
          {
            // The list, then the panel, a gap apart — a row of the two when the list is vertical.
            flexDirection: orientation() === "vertical" ? "row" : "column",
            alignItems: "stretch",
            gap: 8,
          },
          props.style ?? null,
        ]}
      >
        {props.children}
      </View>
    </TabsContext.Provider>
  );
}

function listLook(variant: TabsListVariant) {
  return variant === "line" ? underlineTabsLook() : tabsLook();
}

/** The tab list: capsule track or underline, with the traveling indicator. */
export function TabsList(props: TabsListProps) {
  const [, rest] = split(props, ["variant", "style", "indicatorStyle", "children"]);
  const variant = () => props.variant ?? "default";
  const look = computed(() => listLook(variant()));

  const list = (
    <ListVariantContext.Provider value={variant()}>
      <BaseTabs
        {...rest}
        indicatorStyle={[look().indicatorStyle, props.indicatorStyle ?? null]}
        style={[look().style, props.style ?? null]}
      >
        {props.children}
      </BaseTabs>
    </ListVariantContext.Provider>
  );

  if (variant() !== "line") return list;
  return (
    <View style={{ alignSelf: "stretch" }}>
      <View style={underlineTabsLook().rule} />
      {list}
    </View>
  );
}

/** A tab in the list. Selection follows the root {@link Tabs} value. */
export function TabsTrigger(props: TabsTriggerProps) {
  const ctx = useTabs();
  const variant = ListVariantContext();
  const [, rest] = split(props, [
    "value",
    "children",
    "style",
    "hoverStyle",
    "activeStyle",
    "focusVisibleStyle",
    "disabledStyle",
    "selectedStyle",
    "onPress",
    "accessibilityLabel",
  ]);
  const look = computed(() => listLook(variant));
  const selected = () => (ctx ? ctx.value() === props.value : false);
  const tab = computed(() =>
    look().tab({
      selected: () => selected(),
      disabled: () => !!props.disabled,
    }),
  );

  return (
    <BaseTab
      {...rest}
      selected={selected()}
      accessibilityLabel={labelOf(props.accessibilityLabel, props.children)}
      onPress={() => {
        ctx?.onValueChange(props.value);
        props.onPress?.();
      }}
      style={[tab().style, props.style ?? null]}
      hoverStyle={[tab().hoverStyle ?? null, props.hoverStyle ?? null]}
      activeStyle={[tab().activeStyle ?? null, props.activeStyle ?? null]}
      focusVisibleStyle={[tab().focusVisibleStyle, props.focusVisibleStyle ?? null]}
      disabledStyle={[tab().disabledStyle, props.disabledStyle ?? null]}
      selectedStyle={props.selectedStyle}
    >
      {typeof props.children === "string" ? (
        <TabTitle name={props.children} selected={selected()} />
      ) : (
        props.children
      )}
    </BaseTab>
  );
}

/** `nsh/base`'s Tab with list chrome when used inside {@link TabsList}. */
export function Tab(props: TabProps) {
  const variant = ListVariantContext();
  const [, rest] = split(props, [
    "children",
    "selected",
    "style",
    "hoverStyle",
    "activeStyle",
    "focusVisibleStyle",
    "disabledStyle",
    "selectedStyle",
    "accessibilityLabel",
  ]);
  const look = computed(() => listLook(variant));
  const tab = computed(() =>
    look().tab({
      selected: () => !!props.selected,
      disabled: () => !!props.disabled,
    }),
  );

  return (
    <BaseTab
      {...rest}
      selected={props.selected}
      accessibilityLabel={labelOf(props.accessibilityLabel, props.children)}
      style={[tab().style, props.style ?? null]}
      hoverStyle={[tab().hoverStyle ?? null, props.hoverStyle ?? null]}
      activeStyle={[tab().activeStyle ?? null, props.activeStyle ?? null]}
      focusVisibleStyle={[tab().focusVisibleStyle, props.focusVisibleStyle ?? null]}
      disabledStyle={[tab().disabledStyle, props.disabledStyle ?? null]}
      selectedStyle={props.selectedStyle}
    >
      {typeof props.children === "string" ? (
        <TabTitle name={props.children} selected={!!props.selected} />
      ) : (
        props.children
      )}
    </BaseTab>
  );
}

/** Content for one value. Hidden, not unmounted, while another value is selected. */
export function TabsContent(props: TabsContentProps) {
  const ctx = useTabs();
  const shown = () => (ctx ? ctx.value() === props.value : false);
  return (
    <View
      class={props.class ?? undefined}
      style={[{ display: shown() ? "flex" : "none" }, props.style ?? null]}
    >
      {props.children}
    </View>
  );
}
