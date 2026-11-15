// Resizable panels: `resizableHandleLook` and the group / panel that wear it.
// From NSH's examples/nsh-gallery-ui (Apache-2.0, © Longbridge; see NOTICE): yours to change.
import { split } from "nsh";
import {
  ResizablePanel as BasePanel,
  ResizablePanelGroup as BaseGroup,
  type ResizablePanelGroupProps as BaseGroupProps,
  type ResizablePanelProps as BasePanelProps,
} from "nsh/base";

/**
 * The thumb of a resize handle (`handleThumbClass`), as gpui-component
 * draws it: none at rest, so the hairlines stay quiet; a faint pill grows
 * in under the pointer, and a long solid one while pressed or dragged.
 */
export const handleThumb =
  "h-11 w-[3px] rounded-full bg-muted-foreground opacity-0 scale-y-0 transition duration-150 ease-out group-hover:opacity-40 group-hover:scale-y-[0.45] group-active:opacity-90 group-active:scale-y-100";

/** A resize handle's hairline, which stays as it is (its thumb shows where
 * to drag): `across` a row of panels, `along` a column. */
export const resizableHandle = {
  across: "h-full w-px bg-border",
  along: "h-px w-full bg-border",
  thumb: handleThumb,
};

/** A `ResizablePanelGroup`'s handles (spread it): the hairline across a
 * `horizontal` group's row, along a `vertical` one's column, and the
 * thumb. */
export function resizableHandleLook(axis: "horizontal" | "vertical") {
  return {
    handleClass: axis === "horizontal" ? resizableHandle.across : resizableHandle.along,
    handleThumbClass: handleThumb,
  };
}

function mergeClass(base: string, consumer?: string | null): string {
  return consumer ? `${base} ${consumer}` : base;
}

/** Theme layer on `nsh/base` ResizablePanelGroup. */
export type ResizablePanelGroupProps = BaseGroupProps;

/** Theme layer on `nsh/base` ResizablePanel. */
export type ResizablePanelProps = BasePanelProps;

/** Panels in a row or column. Dragging a handle stays in base; this paints the hairline and thumb. */
export function ResizablePanelGroup(props: ResizablePanelGroupProps) {
  const [, rest] = split(props, [
    "class",
    "style",
    "axis",
    "handleClass",
    "handleStyle",
    "handleThumbClass",
    "handleThumbStyle",
    "handleAccessibilityLabel",
  ]);
  const axis: "horizontal" | "vertical" = props.axis === "vertical" ? "vertical" : "horizontal";
  const look = resizableHandleLook(axis);
  return (
    <BaseGroup
      {...rest}
      axis={props.axis}
      handleAccessibilityLabel={props.handleAccessibilityLabel ?? "Resize"}
      class={props.class}
      style={props.style}
      handleClass={mergeClass(look.handleClass, props.handleClass)}
      handleStyle={props.handleStyle}
      handleThumbClass={mergeClass(look.handleThumbClass, props.handleThumbClass)}
      handleThumbStyle={props.handleThumbStyle}
    />
  );
}

/** One panel. `visible={false}` is the collapsed state. */
export function ResizablePanel(props: ResizablePanelProps) {
  const [, rest] = split(props, ["class", "style"]);
  return <BasePanel {...rest} class={props.class} style={props.style} />;
}
