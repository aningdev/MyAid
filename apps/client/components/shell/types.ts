/** Workspace Shell types. */

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
  /** Display segments under the section's name (a Bot's name, a Dialogue's label…). */
  path: string[];
  title: string;
  kind: NavKind;
  /** The Bot this address shows (`kind` "bot"). Absent on the new-Bot draft. */
  botId?: string;
  /** The Dialogue this address shows (`kind` "dialogue" / "session"). */
  dialogueId?: string;
  /** The claimed Session this address shows (`kind` "session"). */
  sessionId?: string;
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
  | { type: "space"; spaceId: string }
  /** The Bots section's way in: the New Bot sheet, not a stored draft address. */
  | { type: "newBot" };

export type { DockAreaLayout, TreeItem };
