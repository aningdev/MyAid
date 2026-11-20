/**
 * Test-only entry: the Shell with no Host behind it. The providers and Host
 * facts sources reject the way the live ones do, so Settings shows the
 * disconnected explanation and disables the inputs. `nsh test` opens it.
 */
import { mount } from "nsh";

import { AppShell } from "../../components/AppShell";
import { setHostRegistrationTransport } from "../../lib/host/registration";
import type { HostFactsSource } from "./hostFacts";
import { setHostFactsSource } from "./hostFacts";
import { setProvidersSource } from "./providers";

const offline = () => Promise.reject(new Error("宿主未运行：请先启动 Host"));

setProvidersSource({
  listProviders: offline,
  describeSettings: offline,
  describeCredentials: offline,
  updateSettings: offline,
  setCredential: offline,
  unsetCredential: offline,
  modelCatalog: offline,
});

const unavailable: HostFactsSource = {
  status: offline,
  start: offline,
  stop: offline,
  restart: offline,
  launcher: () => ({ phase: "failed", port: 4882, failure: { kind: "exited", code: 1 } }),
};
setHostFactsSource(unavailable);

setHostRegistrationTransport({
  reachable: async () => false,
  call: async () => {
    throw new Error("宿主未运行");
  },
});

mount(AppShell);
