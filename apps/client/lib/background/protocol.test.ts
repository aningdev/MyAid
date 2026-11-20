import { expect, test } from "nsh/test";

import { t } from "../i18n";
import {
  backgroundServicesRunnable,
  decodeRegistrationSnapshot,
  type RegistrationPhase,
} from "./protocol";

function snapshot(phase: RegistrationPhase, reason?: string) {
  return {
    version: 1,
    phase,
    ...(reason === undefined ? {} : { reason }),
  };
}

test("backgroundServicesRunnable is macOS and Windows", () => {
  expect(backgroundServicesRunnable("macos")).toBe(true);
  expect(backgroundServicesRunnable("windows")).toBe(true);
  expect(backgroundServicesRunnable("linux")).toBe(false);
  expect(backgroundServicesRunnable("ios")).toBe(false);
});

test("decodeRegistrationSnapshot reads the Host snapshot", () => {
  const decoded = decodeRegistrationSnapshot(JSON.stringify(snapshot("registered")));
  expect(decoded.version).toBe(1);
  expect(decoded.phase).toBe("registered");
  expect(decoded.reason).toBeUndefined();

  const waiting = decodeRegistrationSnapshot(
    JSON.stringify(snapshot("pendingApproval", "needs approval")),
  );
  expect(waiting.phase).toBe("pendingApproval");
  expect(waiting.reason).toBe("needs approval");
});

test("decodeRegistrationSnapshot rejects a snapshot that is not the Host contract", () => {
  expect(() => decodeRegistrationSnapshot("{")).toThrow(t("background.error.invalidSnapshot"));
  expect(() => decodeRegistrationSnapshot(JSON.stringify({ version: 1 }))).toThrow(
    t("background.error.invalidSnapshot"),
  );
  expect(() =>
    decodeRegistrationSnapshot(JSON.stringify({ version: 2, phase: "registered" })),
  ).toThrow(t("background.error.invalidSnapshot"));
  expect(() =>
    decodeRegistrationSnapshot(JSON.stringify({ version: 1, phase: "registered", reason: 4 })),
  ).toThrow(t("background.error.invalidSnapshot"));
});
