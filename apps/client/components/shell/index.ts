/** Empty Workspace Shell: UI + state colocated here. */
export { Shell } from "./Shell";
export {
  asCenterRoot,
  collectPanelIds,
  emptyLayout,
  normalizeCenter,
  removePanel,
  splitAroundPanel,
  withActivatedPanel,
  type DockNode,
} from "./dock";
export { isDesktopLayout, TITLE_CHROME, titleTopInset } from "./layout";
export {
  NAV_DEFAULT_EXPANDED,
  NAV_TREE_ITEMS,
  SPACE_FIXTURES,
  navActionForId,
  navKindForId,
  spaceById,
} from "./fixtures";
export {
  activateNavItem,
  activePanelId,
  applySpace,
  closePanel,
  dockLayout,
  onPanelActiveChange,
  onPanelRemove,
  openAddress,
  panelContents,
  panelTitle,
  setActivePanel,
  setDockLayout,
  splitActivePanel,
  splitPanel,
  type SplitDirection,
} from "./state";
export type {
  DockAreaLayout,
  NavAction,
  NavAddress,
  NavKind,
  PanelContents,
  ShellRoot,
  SpaceSnapshot,
  TreeItem,
} from "./types";
