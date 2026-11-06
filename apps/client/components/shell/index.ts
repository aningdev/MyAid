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
export {
  isDesktopLayout,
  NAV_DEFAULT_WIDTH,
  NAV_MAX_WIDTH,
  NAV_MIN_WIDTH,
  navOpen,
  navWidth,
  setNavOpen,
  setNavWidth,
  TITLE_CHROME,
  titleTopInset,
  toggleNavOpen,
} from "./layout";
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
