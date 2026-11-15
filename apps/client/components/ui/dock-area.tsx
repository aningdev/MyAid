// Dock area: `dockClasses`, `DockTab`, and the `DockArea` that spreads them.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { colors, finish, terminal } from "../../lib/theme";
import type { JSX } from "nsh";
import { platform, split, Text, View } from "nsh";
import {
  DockArea as BaseDockArea,
  type DockAreaLayout,
  type DockAreaProps as BaseDockAreaProps,
  type DockAreaRef,
  type DockDropIndicator,
  type DockInfo,
  type DockNode,
  type DockPanel,
  type DockPanelOptions,
  type DockPlacement,
  type DockRegion,
  type DockTab as DockTabData,
  type DockTarget,
} from "nsh/base";

import { handleThumb } from "./resizable";

/**
 * A `DockArea`'s parts (spread it): groups and docks on the inset, a tab
 * bar over a hairline (its tabs drawn by `DockTab`), the handles' hairlines
 * and thumbs, a drop target edged and tinted in the brand color, the
 * compact presentation's drawer and sheet on the card's surface over the
 * theme's `scrim`, every modal's backdrop.
 */
export const dockClasses = {
  groupClass: "flex-1 bg-inset",
  tabBarClass: "flex-row gap-1 border-b border-line",
  tabClass: "group",
  contentClass: "flex-1",
  handleClass: "basis-px bg-line",
  handleThumbClass: handleThumb,
  dockClass: "bg-inset",
  dropIndicatorClass: "rounded-lg border-2 border-brand bg-brand-tint",
  drawerClass: "border-r border-border bg-card",
  sheetClass: "rounded-t-2xl border-t border-border bg-card",
  backdropClass: "bg-scrim",
};

/**
 * A dock's tab (what `renderTab` returns, in a `dockClasses` tab): its
 * title sized to it, as wide on either side, muted until the pointer is on
 * it; the shown tab's title in the text color, underlined in the brand
 * color. `children` follow the title (a close button, `dockTabCloseClass`).
 */
export function DockTab(props: {
  title: string;
  active: boolean;
  testID?: string;
  children?: JSX.Element;
}) {
  return (
    <View testID={props.testID} class="h-9 flex-row items-center gap-1 px-3">
      <Text
        style={{ numberOfLines: 1 }}
        class={`max-w-40 text-[13px] font-medium transition-colors ${props.active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}
      >
        {props.title}
      </Text>
      {props.children}
      <If when={props.active}>
        <View
          style={{ pointerEvents: "none" }}
          class="bg-brand absolute right-3 bottom-0 left-3 h-0.5 rounded-full"
        />
      </If>
    </View>
  );
}

/**
 * A dock tab's close button (`class`), its glyph `×` muted text: with a
 * pointer it fades in over the tab's end while the pointer is on the tab;
 * a touch screen keeps it beside the title (show it on the shown tab); a
 * terminal's tab, with no room at its end, sets it beside the title, shown
 * while the pointer is on the tab.
 */
export const dockTabCloseClass = terminal
  ? "size-5 items-center justify-center opacity-0 group-hover:opacity-100"
  : platform.desktop
    ? "absolute right-1 top-2 size-5 items-center justify-center rounded-md bg-inset opacity-0 transition-opacity group-hover:opacity-100 hover:bg-raised"
    : "-mr-1.5 size-5 items-center justify-center rounded-md active:opacity-70";

/** A dragged tab's preview (what `renderDragPreview` returns): its title on a raised chip. */
export function DockDragPreview(props: { title: string }) {
  return (
    <View
      class="border-border rounded-lg border px-3 py-1.5"
      style={{ backgroundColor: colors.raised, ...finish.raised }}
    >
      <Text class="text-foreground text-[13px] font-medium">{props.title}</Text>
    </View>
  );
}

function mergeClass(base: string, consumer?: string | null): string {
  return consumer ? `${base} ${consumer}` : base;
}

export type DockAreaProps = BaseDockAreaProps;

/** The layout of a whole dock area (`layout`, `defaultLayout`, `onLayoutChange`), from `nsh/base`. */
export type { DockAreaLayout };

/** One node of a layout: a split of nodes, or a tab group of panels, from `nsh/base`. */
export type { DockNode };

/** A dock on an edge (`left`, `right`, `bottom`): its layout, size and state, from `nsh/base`. */
export type { DockRegion };

/** Where a dock is: `center` (the area itself), `left`, `right` or `bottom`, from `nsh/base`. */
export type { DockPlacement };

/** A panel as `renderPanel` draws it (its key, `id`), from `nsh/base`. */
export type { DockPanel };

/** What each panel allows (`panels`: closable, zoomable, visible), from `nsh/base`. */
export type { DockPanelOptions };

/** Where a drag would land, as `renderDropIndicator` draws it, from `nsh/base`. */
export type { DockDropIndicator };

/** A dock as `renderDock` draws its chrome, from `nsh/base`. */
export type { DockInfo };

/** Where `movePanel` puts a panel, from `nsh/base`. */
export type { DockTarget };

/** The area's ref: its methods (`addPanel`, `splitAt`, `toggleZoom`…), from `nsh/base`. */
export type { DockAreaRef };

/**
 * A tab as `renderTab` and `renderDragPreview` draw it: `nsh/base`'s `DockTab`, under another name
 * because the tab this library draws is the `DockTab` component.
 */
export type DockTabValue = DockTabData;

function defaultTab(tab: DockTabData) {
  return <DockTab title={tab.panel} active={tab.active} />;
}

function defaultPreview(tab: DockTabData) {
  return <DockDragPreview title={tab.panel} />;
}

function defaultEmpty(): JSX.Element {
  return (
    <View class="flex-1 items-center justify-center p-2">
      <Text class="text-muted text-[13px]">No panels</Text>
    </View>
  );
}

/** A dockable workspace: tabs, splits and edge docks. */
export function DockArea(props: DockAreaProps) {
  const chrome = dockClasses;
  const [, rest] = split(props, [
    "class",
    "style",
    "groupClass",
    "groupStyle",
    "tabBarClass",
    "tabBarStyle",
    "tabClass",
    "tabStyle",
    "contentClass",
    "contentStyle",
    "handleClass",
    "handleStyle",
    "handleThumbClass",
    "handleThumbStyle",
    "handleAccessibilityLabel",
    "dockClass",
    "dockStyle",
    "dropIndicatorClass",
    "dropIndicatorStyle",
    "drawerClass",
    "drawerStyle",
    "sheetClass",
    "sheetStyle",
    "backdropClass",
    "backdropStyle",
    "renderTab",
    "renderDragPreview",
    "renderEmpty",
  ]);
  return (
    <BaseDockArea
      {...rest}
      class={props.class}
      style={props.style}
      handleAccessibilityLabel={props.handleAccessibilityLabel ?? "Resize"}
      groupClass={mergeClass(chrome.groupClass, props.groupClass)}
      groupStyle={props.groupStyle}
      tabBarClass={mergeClass(chrome.tabBarClass, props.tabBarClass)}
      tabBarStyle={props.tabBarStyle}
      tabClass={mergeClass(chrome.tabClass, props.tabClass)}
      tabStyle={props.tabStyle}
      contentClass={mergeClass(chrome.contentClass, props.contentClass)}
      contentStyle={props.contentStyle}
      handleClass={mergeClass(chrome.handleClass, props.handleClass)}
      handleStyle={props.handleStyle}
      handleThumbClass={mergeClass(chrome.handleThumbClass, props.handleThumbClass)}
      handleThumbStyle={props.handleThumbStyle}
      dockClass={mergeClass(chrome.dockClass, props.dockClass)}
      dockStyle={props.dockStyle}
      dropIndicatorClass={mergeClass(chrome.dropIndicatorClass, props.dropIndicatorClass)}
      dropIndicatorStyle={props.dropIndicatorStyle}
      drawerClass={props.drawerClass ?? chrome.drawerClass}
      drawerStyle={props.drawerStyle}
      sheetClass={props.sheetClass ?? chrome.sheetClass}
      sheetStyle={props.sheetStyle}
      backdropClass={props.backdropClass ?? chrome.backdropClass}
      backdropStyle={props.backdropStyle}
      renderTab={props.renderTab ?? defaultTab}
      renderDragPreview={props.renderDragPreview ?? defaultPreview}
      renderEmpty={props.renderEmpty ?? defaultEmpty}
    />
  );
}
