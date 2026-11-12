/** Workspace Shell: UI + state colocated here. */
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
export { NAV_DEFAULT_EXPANDED, SPACE_FIXTURES, rootLabel, spaceById } from "./fixtures";
export {
  NEW_BOT_ITEM_ID,
  navActionForId,
  navItemIdForAddress,
  navItems,
  navKindForId,
  projectNav,
  type NavInput,
  type NavProjection,
} from "./navData";
export {
  NEW_BOT_ADDRESS_ID,
  botAddress,
  dialogueAddress,
  dialogueLabel,
  newBotAddress,
  sessionAddress,
  workspaceSegment,
} from "./navAddresses";
export {
  activateNavItem,
  activeAddress,
  activePanelId,
  applySpace,
  closeActivePanel,
  closePanel,
  dockLayout,
  focusPanel,
  onPanelActiveChange,
  onPanelRemove,
  openAddress,
  openNewBotDraft,
  panelContents,
  panelTitle,
  setActivePanel,
  setDockLayout,
  setPanelAddress,
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
