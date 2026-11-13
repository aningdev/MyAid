/** True on a graphical `nsh test --target`: a headless run has nothing to draw. */
import type { App } from "nsh/test";

export async function graphical(app: App): Promise<boolean> {
  try {
    await app.screenshot();
    return true;
  } catch {
    return false;
  }
}
