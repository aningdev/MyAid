/**
 * `open` with the one marker that makes the app use its isolated Storage for
 * the registry and shell prefs. Every test that opens an app goes through this
 * helper; no suite run reads or writes the real `~/.myaid`.
 */
import { open as openApp, type App, type OpenOptions } from "nsh/test";

import { TEST_HOST_PARAM } from "../lib/data-root";

export function open(entry: string, options: OpenOptions = {}): Promise<App> {
  return openApp(entry, {
    // Tests read the English catalog unless they name a language: the
    // machine's locale must not decide what a suite asserts.
    locale: options.locale ?? "en-US",
    ...options,
    host: {
      ...(options.host ?? {}),
      params: {
        ...(options.host?.params ?? {}),
        [TEST_HOST_PARAM]: true,
      },
    },
  });
}
