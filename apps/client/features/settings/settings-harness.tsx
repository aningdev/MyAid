/**
 * Test-only entry: the Workspace Shell over stand-ins for the Host and dsh.
 * The provider directory, settings document, credential store, model catalog
 * and Host status are all fakes in `test/settings-fixtures`; `nsh test` opens
 * this file, the product never imports it, and no production path installs
 * these sources.
 */
import { host, mount } from "nsh";

import { AppShell } from "../../components/AppShell";
import type { RegistrationPhase } from "../../lib/background/protocol";
import { setHostRegistrationTransport } from "../../lib/host/registration";
import {
  createHostFactsFixture,
  createSettingsFixture,
  mismatchReason,
  UNSUPPORTED_DSH,
} from "../../test/settings-fixtures";
import { setHostFactsSource } from "./hostFacts";
import { setProvidersSource } from "./providers";

let hostPhase: RegistrationPhase = "notRegistered";

function snapshot(): string {
  return JSON.stringify({ version: 1, phase: hostPhase });
}

// The Host and dsh pages read this instead of the local control plane.
setProvidersSource(createSettingsFixture().source);
setHostFactsSource(
  createHostFactsFixture(
    host.params.mismatch === true
      ? {
          dshVersion: UNSUPPORTED_DSH,
          phase: "failed",
          reason: mismatchReason(UNSUPPORTED_DSH),
        }
      : {},
  ),
);

setHostRegistrationTransport({
  reachable: async () => true,
  call: async (op) => {
    if (op === "registrationEnable") hostPhase = "registered";
    else if (op === "registrationStop") hostPhase = "notRegistered";
    else if (op !== "registrationQuery") throw new Error(`unexpected op: ${op}`);
    return snapshot();
  },
});

mount(AppShell);
