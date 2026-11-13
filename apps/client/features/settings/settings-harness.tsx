/**
 * Test-only entry: the Workspace Shell over HostControl / RelayControl
 * stand-ins that report registration facts and accept the shared verbs.
 * `nsh test` opens it; nothing in the product imports it, and no production
 * path installs these transports.
 */
import { mount } from "nsh";

import { AppShell } from "../../components/AppShell";
import { backgroundAvailability, type RegistrationPhase } from "../../lib/background/protocol";
import { setHostRegistrationTransport } from "../../lib/host/registration";
import { setRelayRegistrationTransport } from "../../lib/relay/registration";

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
