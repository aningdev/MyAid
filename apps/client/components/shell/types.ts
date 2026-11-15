/** Workspace Shell types. */

/**
 * What a Pane shows: the Bot whose conversation it is, or nothing (the empty
 * slot a fresh Workbench starts with). One Bot lives in one Pane, so the Bot
 * id is the whole identity — no address, no nested objects.
 */
export type PanelContent = { botId: string } | null;

/** Panel key → what it shows. */
export type PanelContents = Record<string, PanelContent>;

export type { DockAreaLayout } from "../ui/dock-area";
