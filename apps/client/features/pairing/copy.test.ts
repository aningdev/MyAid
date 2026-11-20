/**
 * A pairing failure is shown as the copy that code owns, never as the code or
 * the Carrier's English message.
 */
import { expect, test } from "nsh/test";

import { t } from "../../lib/i18n";
import { pairingErrorText } from "./copy";

test("each pairing failure has its own sentence", () => {
  expect(pairingErrorText("invalid-link")).toBe(t("pairing.error.invalid-link"));
  expect(pairingErrorText("expired-link")).toBe(t("pairing.error.expired-link"));
  expect(pairingErrorText("pairing-rejected")).toBe(t("pairing.error.pairing-rejected"));
  const sentences = [
    pairingErrorText("invalid-link"),
    pairingErrorText("expired-link"),
    pairingErrorText("pairing-rejected"),
    pairingErrorText("runner-offline"),
  ];
  expect(new Set(sentences).size).toBe(4);
  for (const sentence of sentences) expect(sentence.trim().length).toBeGreaterThan(0);
});
