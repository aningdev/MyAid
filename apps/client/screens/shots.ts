/**
 * Screenshot and smoke helpers. `nsh test` runs headless by default, where
 * nothing is drawn: those runs take the probe, see no picture and stop
 * before the UI steps. `nsh test --target macos` (or any graphical target)
 * saves the pictures.
 */
import type { App } from "nsh/test";

const SCRATCHPAD =
  "/private/tmp/claude-501/-Users-zhuxining-Code-MyAid/fcf60928-6235-47f5-bea3-690051a88ab8/scratchpad";

/** The shell's pictures: welcome, marks, New Bot, palette, context menu. */
export const SHOTS_SHELL = `${SCRATCHPAD}/pi-shots-shell`;

/** The chat's pictures: the marker column, the settled turn, attachments. */
export const SHOTS_CHAT = `${SCRATCHPAD}/pi-shots-chat`;

/** The Settings Panel's pictures. */
export const SHOTS_A1 = `${SCRATCHPAD}/pi-shots-a1`;

/** The Bot preset plugin smoke: editable tabs, binding label, new Session reply. */
export const SHOTS_P1 = `${SCRATCHPAD}/pi-shots-p1`;

/** D1: two Bots on one dsh Workspace, rename, pin, archive, restart. */
export const SHOTS_D1 = `${SCRATCHPAD}/pi-shots-d1`;

export { graphical } from "../test/graphical";

/** Real-Host smokes are opt-in: no default suite may need a live Host. */
export function hostSmokeRequested(): boolean {
  return !!process.env.MYAID_SMOKE_HOST_SOCKET;
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
