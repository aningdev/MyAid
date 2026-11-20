/**
 * Relay reasons the Host spells in a stable way, and the pairing clock.
 */
import { expect, test } from "nsh/test";

import { t } from "../../lib/i18n";
import { countdown, pairingExpired, relayReasonText } from "./copy";
import { UNSET_REASON } from "./fixture";

test("a Relay reason becomes the catalog sentence", () => {
  expect(relayReasonText(UNSET_REASON)).toBe(t("devices.relay.unset"));
  expect(relayReasonText("connecting")).toBe(t("devices.relay.connecting"));
  expect(relayReasonText("DSH_BOT_RELAY_URL is not a usable Relay address: no")).toBe(
    t("devices.relay.badAddress"),
  );
  expect(relayReasonText("")).toBe(t("devices.relay.unavailable"));
  expect(relayReasonText("still dialing the far side")).toBe("still dialing the far side");
});

test("the pairing clock expires on the second and counts down", () => {
  expect(pairingExpired(100, 100_000)).toBe(true);
  expect(pairingExpired(101, 100_000)).toBe(false);
  expect(countdown(100 + 65, 100_000)).toBe("1:05");
  expect(countdown(1, 100_000)).toBe("0:00");
});
