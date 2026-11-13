/**
 * Test-only entry: the Workspace Shell over stand-ins for the Host, dsh and
 * the two Background Services. The provider directory, settings document,
 * credential store, model catalog and Host status are all fakes in
 * `test/settings-fixtures`; `nsh test` opens this file, the product never
 * imports it, and no production path installs these sources.
 */
import { host, mount } from "nsh";

import { AppShell } from "../../components/AppShell";
import { backgroundAvailability, type RegistrationPhase } from "../../lib/background/protocol";
import { setHostRegistrationTransport } from "../../lib/host/registration";
import { setRelayRegistrationTransport } from "../../lib/relay/registration";
import { createHostFactsFixture, createSettingsFixture } from "../../test/settings-fixtures";
import { setHostFactsSource } from "./hostFacts";
import { setProvidersSource } from "./providers";

let hostPhase: RegistrationPhase = "notRegistered";
let relayPhase: RegistrationPhase = "pendingApproval";

function snapshot(): string {
  return JSON.stringify({
    version: 1,
    host: { unit: "host", phase: hostPhase },
    relay: { unit: "relay", phase: relayPhase },
    availability: backgroundAvailability(hostPhase, relayPhase),
  });
}

type RegistrationOp = "registrationQuery" | "registrationEnable" | "registrationStop";

/** One fake control channel; a Host snapshot reports its own unit only. */
function transport(
  unit: "host" | "relay",
  write: (phase: RegistrationPhase) => void,
): {
  reachable(): Promise<boolean>;
  call(op: RegistrationOp): Promise<string>;
} {
  return {
    reachable: async () => true,
    call: async (op) => {
      if (op === "registrationQuery") return snapshot();
      if (op === "registrationEnable") {
        write("registered");
        return JSON.stringify({ unit, phase: "registered" });
      }
      if (op === "registrationStop") {
        write("notRegistered");
        return JSON.stringify({ unit, phase: "notRegistered" });
      }
      throw new Error(`unexpected ${unit} op: ${op}`);
    },
  };
}

// The Host and dsh pages read this instead of the local control plane.
setProvidersSource(createSettingsFixture().source);
setHostFactsSource(
  createHostFactsFixture(
    host.params.mismatch === true
      ? {
          dshVersion: "0.2.2-rc.1",
          phase: "failed",
          reason: "官方 dsh 版本不兼容：实际 0.2.2-rc.1，需要 0.2.2-rc.2",
        }
      : {},
  ),
);

setHostRegistrationTransport(
  transport("host", (phase) => {
    hostPhase = phase;
  }),
);
setRelayRegistrationTransport(
  transport("relay", (phase) => {
    relayPhase = phase;
  }),
);

mount(AppShell);
