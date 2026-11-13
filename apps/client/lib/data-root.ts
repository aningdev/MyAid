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

/** The environment variable a real-Host smoke sets: the only opt-in past the test marker. */
export const SMOKE_ENV = "MYAID_SMOKE_HOST";

/**
 * Whether this app may talk to the local Host / Relay control plane at all — probe a port, read
 * a `serve-token`, start a Host.
 *
 * A test app may not: the user's real Host may be listening on 4872 with the real `~/.myaid`, so
 * a test that probed it would read, or start work on, the person's own machine. `test/open.ts`
 * marks every app it opens, and `test/host-control.test.tsx` proves such an app neither probes
 * nor spawns. A real-Host smoke opts in with `MYAID_SMOKE_HOST`.
 */
export function hostControlAllowed(
  testApp: boolean = usesTestStorage(),
  smoke: string | undefined = typeof process !== "undefined" && process.env
    ? process.env[SMOKE_ENV]
    : undefined,
): boolean {
  return !testApp || !!smoke;
}
