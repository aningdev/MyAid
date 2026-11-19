// A collapsible: `nsh/base`'s Collapsible in the disclosure look of `accordion.tsx` — a trigger row
// and the panel it reveals. This library's own: nothing here comes from upstream, so there is no
// port region. Yours to change.
import type { JSX, StyleProp, ViewStyle } from "nsh";
import { context, split, View } from "nsh";
import {
  Collapsible as BaseCollapsible,
  type CollapsibleProps as BaseCollapsibleProps,
  type OpenChangeReason,
} from "nsh/base";

import {
  disclosurePanel,
  disclosureTriggerLook,
  DisclosureChevron,
  type DisclosurePanelOptions,
} from "./accordion";
import { createOpenState, createSlot, type OpenState, type Slot } from "../../lib/open-state";
import { RowLabel } from "../../lib/surface";
import { labelOf } from "../../lib/utils";

/** Why a collapsible opened or closed (`onOpenChange`'s `reason`): `nsh/base`'s `OpenChangeReason`, under this part's name. */
export type CollapsibleOpenChangeReason = OpenChangeReason;

/** The root: it owns whether the panel is open, and the trigger slot. */
export type CollapsibleProps = {
  /** Controlled; leave it out and the root keeps the state (`defaultOpen`). */
  open?: boolean | null;
  defaultOpen?: boolean;
  children?: JSX.Element;
  /** Told whenever it opens or closes, and why. */
  onOpenChange?: (event: { open: boolean; reason: CollapsibleOpenChangeReason }) => void;
};

/** `nsh/base` Collapsible as content. `children` become the revealed panel. */
export type CollapsibleContentProps = Omit<
  BaseCollapsibleProps,
  "open" | "content" | "children"
> & {
  children?: JSX.Element;
  panel?: DisclosurePanelOptions;
};

/** Toggles open: a disclosure row, not a `Button`. String children are the title. */
export type CollapsibleTriggerProps = {
  children?: string | JSX.Element;
  disabled?: boolean;
  class?: string | null;
  style?: StyleProp<ViewStyle>;
  hoverStyle?: StyleProp<ViewStyle>;
  activeStyle?: StyleProp<ViewStyle>;
  focusVisibleStyle?: StyleProp<ViewStyle>;
  disabledStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string | null;
  first?: boolean;
  start?: number;
};

type CollapsibleContextValue = OpenState & {
  trigger: Slot<JSX.Element>;
};

const CollapsibleContext = context<CollapsibleContextValue | null>(null);

function useCollapsible() {
  const ctx = CollapsibleContext();
  if (!ctx) throw new Error("Collapsible parts must be used within <Collapsible>");
  return ctx;
}

/** Owns open state for `CollapsibleTrigger` and `CollapsibleContent`. */
export function Collapsible(props: CollapsibleProps) {
  const state = createOpenState<CollapsibleOpenChangeReason>(props);
  const trigger = createSlot<JSX.Element>();
  return (
    <CollapsibleContext.Provider value={{ ...state, trigger }}>
      {props.children}
    </CollapsibleContext.Provider>
  );
}

/** Registers the disclosure row; `CollapsibleContent` renders it as the base child. */
export function CollapsibleTrigger(props: CollapsibleTriggerProps) {
  const ctx = useCollapsible();
  ctx.trigger.set(() => {
    const look = disclosureTriggerLook({
      first: props.first,
      start: props.start,
      disabled: () => Boolean(props.disabled),
    });
    const children = props.children;
    const disabled = Boolean(props.disabled);
    const body =
      typeof children === "string" ? (
        <RowLabel label={children} strong />
      ) : (
        <View style={{ flexGrow: 1, flexShrink: 1 }}>{children}</View>
      );

    return (
      <View
        accessible
        role="button"
        accessibilityLabel={labelOf(props.accessibilityLabel, children) ?? undefined}
        accessibilityState={{ expanded: ctx.open(), disabled }}
        class={props.class ? `${look.class} ${props.class}` : look.class}
        onPress={disabled ? undefined : () => ctx.setOpen(!ctx.open())}
        style={[look.style, props.style ?? null]}
        hoverStyle={[look.hoverStyle ?? null, props.hoverStyle ?? null]}
        activeStyle={[look.activeStyle, props.activeStyle ?? null]}
        focusVisibleStyle={[look.focusVisibleStyle, props.focusVisibleStyle ?? null]}
        disabledStyle={[look.disabledStyle, props.disabledStyle ?? null]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flexGrow: 1 }}>
          {body}
          <DisclosureChevron open={ctx.open()} />
        </View>
      </View>
    );
  });
  return null;
}

/** The collapsible region; the registered trigger is the base child. */
export function CollapsibleContent(props: CollapsibleContentProps) {
  const ctx = useCollapsible();
  const trigger = ctx.trigger.get();
  const [, rest] = split(props, ["style", "children", "reveal", "panel"]);
  const panel = props.panel;
  return (
    <BaseCollapsible
      {...rest}
      open={ctx.open()}
      reveal={props.reveal ?? true}
      style={[{ alignItems: "stretch" }, props.style ?? null]}
      content={<View style={disclosurePanel(panel)}>{props.children}</View>}
    >
      {trigger?.() ?? <View />}
    </BaseCollapsible>
  );
}
