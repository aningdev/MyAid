/**
 * The Pairing entry's copy. One message per `RelayErrorCode`, so a new code
 * fails the build here instead of showing a raw English `message`.
 */
import type { RelayErrorCode } from "../../lib/carrier/relay/errors";
import { t, type MessageKey } from "../../lib/i18n";

const ERROR_KEYS: Record<RelayErrorCode, MessageKey> = {
  "invalid-link": "pairing.error.invalid-link",
  "expired-link": "pairing.error.expired-link",
  "pairing-rejected": "pairing.error.pairing-rejected",
  "handshake-failed": "pairing.error.handshake-failed",
  "device-revoked": "pairing.error.device-revoked",
  "runner-offline": "pairing.error.runner-offline",
  replaced: "pairing.error.replaced",
  overloaded: "pairing.error.overloaded",
  "bad-auth": "pairing.error.bad-auth",
  "too-many": "pairing.error.too-many",
  idle: "pairing.error.idle",
  forbidden: "pairing.error.forbidden",
  protocol: "pairing.error.protocol",
  unavailable: "pairing.error.unavailable",
  "ping-timeout": "pairing.error.ping-timeout",
  closed: "pairing.error.closed",
  "invalid-identity": "pairing.error.invalid-identity",
  "invalid-pairing": "pairing.error.invalid-pairing",
};

export function pairingErrorText(code: RelayErrorCode): string {
  return t(ERROR_KEYS[code]);
}
