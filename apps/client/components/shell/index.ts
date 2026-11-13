/** Workspace Shell: UI + state colocated here. */
export { Shell } from "./Shell";
export {
  botList,
  botRowOf,
  botRows,
  normalizeQuery,
  type BotList,
  type BotListInput,
  type BotRow,
} from "./botList";
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
export { isPinned, pins, setPins, togglePin } from "./pins";
export { closeSettings, openSettings, settingsOpen, toggleSettings } from "./SettingsOverlay";
export {
  activeBotId,
  activePanelId,
  applyWorkbench,
  closeActivePanel,
  closePanel,
  dockLayout,
  dropBot,
  focusPanel,
  onPanelActiveChange,
  onPanelRemove,
  openBot,
  openBot as openAddress,
  panelBotId,
  panelContents,
  panelForBot,
  panelTitle,
  setActivePanel,
  setDockLayout,
  setPanelBot,
  splitActivePanel,
  splitPanel,
  type SplitDirection,
} from "./state";
export type { DockAreaLayout, PanelContent, PanelContents } from "./types";
