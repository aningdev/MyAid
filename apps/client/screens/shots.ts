/**
 * Screenshot helpers for the B5 capture tests. `nsh test` runs headless by
 * default, where nothing is drawn: those runs take the probe, see no
 * picture and stop before the UI steps. `nsh test --target macos` (or any
 * graphical target) saves the pictures.
 */
import type { App } from "nsh/test";

export const SHOTS =
  "/private/tmp/claude-501/-Users-zhuxining-Code-MyAid/fcf60928-6235-47f5-bea3-690051a88ab8/scratchpad/pi-shots-b5";

/** True on a graphical target: a headless run throws here. */
export async function graphical(app: App): Promise<boolean> {
  try {
    await app.screenshot();
    return true;
  } catch {
    return false;
  }
}

export async function shoot(app: App, name: string): Promise<void> {
  await app.screenshot(`${SHOTS}/${name}`);
}
