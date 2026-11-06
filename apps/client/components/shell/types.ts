/** Workspace Shell types (empty-shell stage). */

import type { DockAreaLayout, TreeItem } from "nsh/base";

export type ShellRoot =
  | "favorites"
  | "mail"
  | "task"
  | "knowledge"
  | "bots"
  | "dialogues"
  | "spaces"
  | "settings";

export type NavKind = "folder" | "bot" | "dialogue" | "session" | "setting" | "favorite" | "space";

export type NavAddress = {
  id: string;
  root: ShellRoot;
  path: string[];
  title: string;
  kind: NavKind;
};

/** Panel key → Nav address (null = empty slot). */
export type PanelContents = Record<string, NavAddress | null>;

export type SpaceSnapshot = {
  id: string;
  title: string;
  layout: DockAreaLayout;
  contents: PanelContents;
  activePanelId: string;
};

/** Extra payload keyed by Tree item id (address open or Space apply). */
export type NavAction =
  | { type: "address"; address: NavAddress }
  | { type: "space"; spaceId: string };

export type { DockAreaLayout, TreeItem };
