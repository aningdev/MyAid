// A segmented control: the look (`segmentedLook`) and the parts that wear it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors, finish, focusRing, hovered } from "../../lib/theme";
import type { JSX, StyleProp, TextStyle, ViewStyle } from "nsh";
import { computed, context, platform, signal, split, Text, View } from "nsh";
import {
  Tab as BaseTab,
  Tabs as BaseTabs,
  type TabProps as BaseTabProps,
  type TabsProps as BaseTabsProps,
} from "nsh/base";

import { labelOf, type Live, read } from "../../lib/utils";
import type { TabLook, TabState } from "./tabs";

/**
 * The hover rule `tabsLook` uses, repeated here because `tabs.tsx` does not export it: under the
 * pointer, a segment that is neither selected (its thumb shows) nor disabled.
 */
const hoverOf = (state: TabState) => {
  const selected = typeof state.selected === "function" ? state.selected() : state.selected;
  const disabled =
    state.disabled === undefined
      ? undefined
      : typeof state.disabled === "function"
        ? state.disabled()
        : state.disabled;
  return selected || disabled ? undefined : hovered();
};

const pointer = platform.desktop;

/** A segmented control's size: `default` 24 / 30 points with a pointer, 32 / 36 on a touch screen. */
export type SegmentedSize = "sm" | "default";

/** Options of `segmentedLook`. */
export interface SegmentedLookOptions {
  /** Default `default`: 30 points high with a pointer (`sm`: 24). */
  size?: SegmentedSize;
  /** Span the row, the segments sharing it equally (always on a touch screen). */
  fill?: boolean;
}

/**
 * A segmented control's look: a sunk track (`style`, on `Tabs` or a
 * `RadioGroup`) as wide as its labels with a pointer (30 points high,
 * 12-point labels, the thumb's corners 6 and the track's 9), spanning the
 * row on a touch screen or with `fill`; the selected segment's thumb,
 * standing off the track in both appearances (`finish.thumb`: white with a
 * soft drop on a light track), as `Tabs`' traveling `indicatorStyle` or as
 * a `Radio`'s `checkedStyle` (`thumbStyle`); each segment's props
 * (`segment(state)`: hover, the focus ring, dimmed while disabled) and its
 * label's (`label(selected)`, `count`).
 */
export function segmentedLook(o?: SegmentedLookOptions) {
  const small = o?.size === "sm";
  const spread = !pointer || !!o?.fill;
  // The track's padding: the thumb sits inside it.
  const inset = 2;
  // Small is as tall as a small button with a pointer (24), so the two sit level in a row.
  const height = pointer ? (small ? 24 : 30) : small ? 32 : 36;
  // The thumb's corners, two points inside the track's.
  const thumbCorner = pointer ? 6 : 7;
  const thumb = (): ViewStyle => ({
    borderRadius: thumbCorner,
    borderCurve: "continuous",
    borderWidth: 1,
    ...finish.thumb,
  });
  return {
    get style(): ViewStyle {
      return {
        height,
        flexDirection: "row",
        alignSelf: spread ? "stretch" : "flex-start",
        padding: inset,
        borderRadius: pointer ? 9 : 10,
        borderCurve: "continuous",
        // Sunk like the pill bar's, not the switch's track: in dark the track is
        // raised as the thumb is, which would hide the thumb.
        backgroundColor: colors.inset,
        boxShadow: finish.track.boxShadow,
        borderWidth: 1,
        borderColor: colors.border,
      };
    },
    /** The thumb as `Tabs`' indicator, which the core springs to the selected tab. */
    get indicatorStyle(): ViewStyle {
      return { top: inset, bottom: inset, ...thumb() };
    },
    /** The thumb on the selected segment itself (a `Radio`'s `checkedStyle`). */
    get thumbStyle(): ViewStyle {
      return thumb();
    },
    segment(state: TabState): TabLook {
      return {
        // A clear edge the thumb's takes over, so a checked segment keeps its size.
        style: {
          ...(spread ? { flex: 1, paddingHorizontal: 7 } : { paddingHorizontal: 9 }),
          borderRadius: thumbCorner,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: "transparent",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
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
    label(selected: Live<boolean | undefined>): TextStyle {
      return {
        numberOfLines: 1,
        fontSize: pointer ? 12 : small ? 13 : 14,
        fontWeight: "500",
        color: read(selected) ? colors.text : colors.muted,
      };
    },
    get count(): TextStyle {
      return { fontSize: pointer ? 11 : 12, color: colors.faint, fontVariant: ["tabular-nums"] };
    },
  };
}

/** Composition root: the selected segment value. */
export type SegmentedProps = {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children?: JSX.Element;
  class?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** The sunk track and traveling thumb (`nsh/base`'s `Tabs`). */
export type SegmentedListProps = Omit<BaseTabsProps, "children"> & {
  size?: SegmentedSize;
  fill?: boolean;
  children?: JSX.Element;
};

/** One segment. String children are the label. */
export type SegmentedItemProps = Omit<BaseTabProps, "selected" | "children"> & {
  value: string;
  count?: number;
  children?: string | JSX.Element;
};

type SegmentedContextValue = {
  value: () => string;
  onValueChange: (value: string) => void;
};

const SegmentedContext = context<SegmentedContextValue | null>(null);

/** What a segment reads from its list: the axes the list was given. */
type SegmentedListAxes = Pick<SegmentedLookOptions, "size" | "fill">;

const SegmentedListContext = context<SegmentedListAxes | null>(null);

function useSegmented() {
  const ctx = SegmentedContext();
  if (!ctx) throw new Error("Segmented parts must be used within <Segmented>");
  return ctx;
}

/** Holds the selected value; wrap {@link SegmentedList} and panels. */
export function Segmented(props: SegmentedProps) {
  const [, rest] = split(props, [
    "value",
    "defaultValue",
    "onValueChange",
    "children",
    "class",
    "style",
  ]);
  const uncontrolled = signal(props.value ?? props.defaultValue ?? "");
  const value = () => (props.value != null ? props.value : uncontrolled());

  return (
    <SegmentedContext.Provider
      value={{
        value,
        onValueChange: (next) => {
          if (props.value == null) uncontrolled.set(next);
          props.onValueChange?.(next);
        },
      }}
    >
      <View {...rest} class={props.class ?? undefined} style={props.style}>
        {props.children}
      </View>
    </SegmentedContext.Provider>
  );
}

/** The track list. Pass `size` and `fill` here (they are read once per control). */
export function SegmentedList(props: SegmentedListProps) {
  const [, rest] = split(props, ["size", "fill", "style", "indicatorStyle", "children"]);
  const look = computed(() => segmentedLook({ size: props.size, fill: props.fill }));

  return (
    <SegmentedListContext.Provider value={{ size: props.size, fill: props.fill }}>
      <BaseTabs
        {...rest}
        indicatorStyle={[look().indicatorStyle, props.indicatorStyle ?? null]}
        style={[look().style, props.style ?? null]}
      >
        {props.children}
      </BaseTabs>
    </SegmentedListContext.Provider>
  );
}

/** A segment in the list. */
export function SegmentedItem(props: SegmentedItemProps) {
  const ctx = useSegmented();
  const list = SegmentedListContext();
  const [, rest] = split(props, [
    "value",
    "count",
    "children",
    "style",
    "hoverStyle",
    "activeStyle",
    "focusVisibleStyle",
    "disabledStyle",
    "onPress",
    "accessibilityLabel",
  ]);
  const look = computed(() => segmentedLook({ size: list?.size, fill: list?.fill }));
  const selected = () => ctx.value() === props.value;
  const segment = computed(() =>
    look().segment({
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
        ctx.onValueChange(props.value);
        props.onPress?.();
      }}
      style={[segment().style, props.style ?? null]}
      hoverStyle={[segment().hoverStyle ?? null, props.hoverStyle ?? null]}
      activeStyle={[segment().activeStyle ?? null, props.activeStyle ?? null]}
      focusVisibleStyle={[segment().focusVisibleStyle, props.focusVisibleStyle ?? null]}
      disabledStyle={[segment().disabledStyle, props.disabledStyle ?? null]}
    >
      {typeof props.children === "string" ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Text style={look().label(selected())}>{props.children}</Text>
          <If when={props.count !== undefined}>
            <Text style={look().count}>{props.count}</Text>
          </If>
        </View>
      ) : (
        props.children
      )}
    </BaseTab>
  );
}
