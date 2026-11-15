/**
 * Screenshot and smoke helpers. `nsh test` runs headless by default, where
 * nothing is drawn: those runs take the probe, see no picture and stop
 * before the UI steps. `nsh test --target macos` (or any graphical target)
 * saves the pictures.
 */
import { homedir } from "os";
import { join } from "path";

import type { App } from "nsh/test";

/** Pictures land beside the isolated dev roots, never in the real `~/.myaid`. */
const SCRATCHPAD = join(homedir(), ".myaid-dev", "shots");

/** The shell's pictures: welcome, marks, New Bot, palette, context menu. */
export const SHOTS_SHELL = `${SCRATCHPAD}/pi-shots-shell`;

/** The chat's pictures: the marker column, the settled turn, attachments. */
export const SHOTS_CHAT = `${SCRATCHPAD}/pi-shots-chat`;

/** The Settings Panel's pictures. */
export const SHOTS_A1 = `${SCRATCHPAD}/pi-shots-a1`;

/** The Bot preset plugin smoke: editable tabs, binding label, new Session reply. */
export const SHOTS_P1 = `${SCRATCHPAD}/pi-shots-p1`;

/** Bot app smoke: two Bots in two Panes, Pin, drag-in, restart, details edit. */
export const SHOTS_L1 = `${SCRATCHPAD}/pi-shots-l1`;

/** Long conversation: the divider, the history rail and a directory change. */
export const SHOTS_L2 = `${SCRATCHPAD}/pi-shots-l2`;

/** Session-model smoke: concurrent Panels, queued prompt, approval, restart, paging. */
export const SHOTS_SESSION = `${SCRATCHPAD}/pi-shots-d2`;

/** Native-layer smoke: the Host running, its restart and resume, its empty state. */
export const SHOTS_N1 = `${SCRATCHPAD}/pi-shots-n1`;

/** L3 Settings: providers, general, background and about, in both appearances. */
export const SHOTS_L3 = `${SCRATCHPAD}/pi-shots-l3`;

/** L4 i18n: the list and Panes, Bot details, Settings › General and the footer, in both languages. */
export const SHOTS_L4 = `${SCRATCHPAD}/pi-shots-l4`;

/** Batch 2 of the shadcn-nsh controls: palette, Bot details, dialogs, menus and Markdown. */
export const SHOTS_UI2 = `${SCRATCHPAD}/pi-shots-ui2`;

/** Batch 4: input groups, the title field, plugin switches and the image viewer. */
export const SHOTS_UI4 = `${SCRATCHPAD}/pi-shots-ui4`;

/** Batch 5a: the `Separator`, `Kbd` and `Empty` copies on the shell and the chat. */
export const SHOTS_UI5A = `${SCRATCHPAD}/pi-shots-ui5a`;

export { graphical } from "../test/graphical";

/**
 * Real-Host smokes are opt-in: no default suite may need a live Host, and an app a test opens
 * never touches the local control plane unless this is set (`lib/data-root.ts`). `MYAID_SMOKE_HOST`
 * runs them against the Host the app launches itself.
 */
export function hostSmokeRequested(): boolean {
  return !!process.env.MYAID_SMOKE_HOST;
}

/** The launcher smoke's mode: `1` for the running Host, `empty` for a Host that cannot run. */
export function hostSmokeMode(): string {
  return process.env.MYAID_SMOKE_HOST ?? "";
}

export async function shoot(app: App, name: string, dir: string = SHOTS_SHELL): Promise<void> {
  try {
    await app.screenshot(`${dir}/${name}`);
  } catch (error) {
    // A test runner has no filesystem for the picture directory. The picture
    // still proves the frame drew; only saving it is best-effort.
    const message = String(error);
    if (!/No such file|ENOENT|cannot find the path/i.test(message)) throw error;
    await app.screenshot();
  }
}
