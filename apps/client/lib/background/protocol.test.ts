import { expect, test } from "nsh/test";

import {
  backgroundAvailability,
  decodeRegistrationSnapshot,
  decodeUnitRegistration,
  mergeProductRegistration,
  type RegistrationPhase,
} from "./protocol";

function unit(unit: "host" | "relay", phase: RegistrationPhase, reason?: string) {
  return { unit, phase, reason: reason ?? null };
}

function snapshot(
  hostPhase: RegistrationPhase,
  relayPhase: RegistrationPhase,
  availability?: "off" | "degraded" | "full",
) {
  return {
    version: 1,
    host: unit("host", hostPhase),
    relay: unit("relay", relayPhase),
    availability: availability ?? backgroundAvailability(hostPhase, relayPhase),
  };
}

test("backgroundAvailability matches ADR-0002 half-enabled as degraded", () => {
  expect(backgroundAvailability("registered", "notRegistered")).toBe("degraded");
  expect(backgroundAvailability("notRegistered", "registered")).toBe("degraded");
  expect(backgroundAvailability("registered", "registered")).toBe("full");
  expect(backgroundAvailability("notRegistered", "notRegistered")).toBe("off");
});

test("mergeProductRegistration takes host facts from HostControl and relay from RelayControl", () => {
  const merged = mergeProductRegistration(
    snapshot("registered", "notRegistered", "off"),
    snapshot("notRegistered", "pendingApproval", "off"),
  );
  expect(merged.host.phase).toBe("registered");
  expect(merged.relay.phase).toBe("pendingApproval");
  expect(merged.availability).toBe("degraded");
});

test("decodeRegistrationSnapshot accepts contract wire tokens", () => {
  const raw = JSON.stringify(snapshot("denied", "failed"));
  const decoded = decodeRegistrationSnapshot(raw);
  expect(decoded.host.phase).toBe("denied");
  expect(decoded.relay.phase).toBe("failed");
});

test("decodeUnitRegistration validates unit field", () => {
  const raw = JSON.stringify(unit("relay", "registered"));
  expect(decodeUnitRegistration(raw).unit).toBe("relay");
});
