/**
 * Center-only DockAreaLayout helpers (Workbench).
 * Center root is always a split per nsh/base DockAreaLayout.
 */
import type { DockAreaLayout, DockNode } from "nsh/base";

export type { DockNode };

export function asCenterRoot(node: DockNode): DockNode {
  if (node.type === "split") return node;
  return {
    type: "split",
    axis: "horizontal",
    children: [node],
    sizes: [null],
  };
}

export function emptyLayout(panelId: string): DockAreaLayout {
  return {
    center: asCenterRoot({ type: "tabs", panels: [panelId], activeIndex: 0 }),
  };
}

export function collectPanelIds(node: DockNode): string[] {
  if (node.type === "tabs") return [...node.panels];
  return node.children.flatMap(collectPanelIds);
}

export function activatePanel(node: DockNode, panelId: string): DockNode {
  if (node.type === "tabs") {
    const idx = node.panels.indexOf(panelId);
    if (idx < 0) return node;
    return { ...node, activeIndex: idx };
  }
  return {
    ...node,
    children: node.children.map((c) => activatePanel(c, panelId)),
  };
}

export function withActivatedPanel(layout: DockAreaLayout, panelId: string): DockAreaLayout {
  return { ...layout, center: activatePanel(layout.center, panelId) };
}

export function splitAroundPanel(
  node: DockNode,
  panelId: string,
  newPanelId: string,
  axis: "horizontal" | "vertical",
): DockNode {
  if (node.type === "tabs") {
    if (!node.panels.includes(panelId)) return node;
    return {
      type: "split",
      axis,
      children: [node, { type: "tabs", panels: [newPanelId], activeIndex: 0 }],
      sizes: [null, null],
    };
  }
  return {
    ...node,
    children: node.children.map((c) => splitAroundPanel(c, panelId, newPanelId, axis)),
  };
}

export function removePanel(node: DockNode, panelId: string): DockNode | null {
  if (node.type === "tabs") {
    const panels = node.panels.filter((p) => p !== panelId);
    if (panels.length === 0) return null;
    let activeIndex = node.activeIndex ?? 0;
    const oldIdx = node.panels.indexOf(panelId);
    if (oldIdx >= 0 && activeIndex >= oldIdx) activeIndex = Math.max(0, activeIndex - 1);
    if (activeIndex >= panels.length) activeIndex = panels.length - 1;
    return { type: "tabs", panels, activeIndex };
  }
  const children = node.children
    .map((c) => removePanel(c, panelId))
    .filter((c): c is DockNode => c !== null);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return {
    ...node,
    children,
    sizes: children.map((_, i) => node.sizes?.[i] ?? null),
  };
}

export function normalizeCenter(node: DockNode | null): DockNode | null {
  if (node === null) return null;
  return asCenterRoot(node);
}
