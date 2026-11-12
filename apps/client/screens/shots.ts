/**
 * Screenshot helpers for the capture tests. `nsh test` runs headless by
 * default, where nothing is drawn: those runs take the probe, see no
 * picture and stop before the UI steps. `nsh test --target macos` (or any
 * graphical target) saves the pictures.
 */
import type { App } from "nsh/test";

const SCRATCHPAD =
  "/private/tmp/claude-501/-Users-zhuxining-Code-MyAid/fcf60928-6235-47f5-bea3-690051a88ab8/scratchpad";

/** The B5 batch's pictures. */
export const SHOTS = `${SCRATCHPAD}/pi-shots-b5`;

/** This batch's pictures: the marker column, the settled turn, attachments. */
export const SHOTS_W2 = `${SCRATCHPAD}/pi-shots-w2`;

/** True on a graphical target: a headless run throws here. */
export async function graphical(app: App): Promise<boolean> {
  try {
    await app.screenshot();
    return true;
  } catch {
    return false;
  }
}

export async function shoot(app: App, name: string, dir: string = SHOTS): Promise<void> {
  await app.screenshot(`${dir}/${name}`);
}
