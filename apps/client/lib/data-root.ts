/**
 * The product data root (`~/.dsh-bot`, or the isolated root `DSH_BOT_HOME`
 * names), and the one seam tests use to keep every app they open away from the
 * real home. The test helper sets a host launch parameter; shell prefs then use
 * the app's isolated Storage instead of the desktop file. The Registry is not
 * stored on the Device.
 * The product default sets neither.
 */
import { homedir } from "os";
import { join } from "path";

import { host } from "nsh";

/** Host launch parameter a test harness sets before the app starts. */
export const TEST_HOST_PARAM = "dshBotTest";

/** Environment variable naming an isolated data root (`bun run dev --isolated`). */
export const DATA_ROOT_ENV = "DSH_BOT_HOME";

/**
 * The data root the prefs, Host token and the Host itself share:
 * `DSH_BOT_HOME` when set (it must sit under `~/.dsh-bot-dev`, the granted
 * isolated area), else `~/.dsh-bot`. Unaffected by the test marker.
 */
export function dataRootPath(
  raw: string | undefined = typeof process !== "undefined" && process.env
    ? process.env[DATA_ROOT_ENV]
    : undefined,
): string {
  const named = raw?.trim();
  return named ? named : join(homedir(), ".dsh-bot");
}

/** `<data root>/prefs/client.json`. */
export function prefsPath(): string {
  return join(dataRootPath(), "prefs", "client.json");
}

/** True when the app was opened by the test helper. */
export function usesTestStorage(): boolean {
  return host.params[TEST_HOST_PARAM] === true;
}

/** The environment variable a real-Host smoke sets: the only opt-in past the test marker. */
export const SMOKE_ENV = "DSH_BOT_SMOKE_HOST";

/** The environment variable that points the Host's Bridge at a Relay. */
export const RELAY_ENV = "DSH_BOT_RELAY_URL";

/** Hosts a test may name as its Relay: this machine, never the project's. */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Whether `address` names a Relay on this machine. A smoke's Host dials whatever
 * `DSH_BOT_RELAY_URL` says, and the Host's default is the project's public Relay: a
 * test run must name a local one (or an unused local port) rather than reach it.
 */
export function relayIsLocal(address: string | undefined): boolean {
  if (!address) return false;
  try {
    const url = new URL(address);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.includes(url.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Whether this app may talk to the local Host control plane at all — probe a port, read
 * a `serve-token`, start a Host.
 *
 * A test app may not: the user's real Host may be listening on 4872 with the real `~/.dsh-bot`, so
 * a test that probed it would read, or start work on, the person's own machine. `test/open.ts`
 * marks every app it opens, and `test/host-control.test.tsx` proves such an app neither probes
 * nor spawns. A real-Host smoke opts in with `DSH_BOT_SMOKE_HOST`, and only while
 * `DSH_BOT_RELAY_URL` names a Relay on this machine, so no smoke dials the project's.
 */
export function hostControlAllowed(
  testApp: boolean = usesTestStorage(),
  smoke: string | undefined = typeof process !== "undefined" && process.env
    ? process.env[SMOKE_ENV]
    : undefined,
  relay: string | undefined = typeof process !== "undefined" && process.env
    ? process.env[RELAY_ENV]
    : undefined,
): boolean {
  return !testApp || (!!smoke && relayIsLocal(relay));
}
