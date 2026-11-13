/**
 * The product data root (`~/.myaid`), and the one seam tests use to keep every
 * app they open away from the real home. The test helper sets a host launch
 * parameter; the registry and shell prefs then use the app's isolated Storage
 * instead of the desktop files. The product default never sets it.
 */
import { homedir } from "os";
import { join } from "path";

import { host } from "nsh";

/** Host launch parameter a test harness sets before the app starts. */
export const TEST_HOST_PARAM = "myaidTest";

/** The desktop data root; the product default, unaffected by the test marker. */
export function dataRootPath(): string {
  return join(homedir(), ".myaid");
}

/** `~/.myaid/registry/bots.json`. */
export function registryPath(): string {
  return join(dataRootPath(), "registry", "bots.json");
}

/** `~/.myaid/prefs/client.json`. */
export function prefsPath(): string {
  return join(dataRootPath(), "prefs", "client.json");
}

/** True when the app was opened by the test helper. */
export function usesTestStorage(): boolean {
  return host.params[TEST_HOST_PARAM] === true;
}
