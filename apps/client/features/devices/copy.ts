import { t } from "../../lib/i18n";
/**
 * Words and clocks for the Devices page. Relay reasons the Host spells in a
 * stable way become catalog sentences; anything else is the Host's own text.
 * The pairing link is not formatted here and is never logged.
 */
import { dayLabel, clockLabel } from "../dialogue/chat/time";

/** The Host's sentence while the Bridge is still dialing. */
const CONNECTING = "connecting";

/** A catalog sentence for a Relay `reason`, or the Host's own words. */
export function relayReasonText(reason: string | null | undefined): string {
  if (!reason) return t("devices.relay.unavailable");
  if (reason === CONNECTING) return t("devices.relay.connecting");
  if (reason.startsWith("DSH_BOT_RELAY_URL")) return t("devices.relay.badAddress");
  return reason;
}

/** True once `expiresAt` (Unix seconds) is no longer in the future. */
export function pairingExpired(expiresAt: number, nowMs: number): boolean {
  return Math.floor(nowMs / 1000) >= expiresAt;
}

/** `m:ss` left until the pairing link expires. */
export function countdown(expiresAt: number, nowMs: number): string {
  const left = Math.max(0, expiresAt - Math.floor(nowMs / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** When a Device was paired or last seen. `0` has never happened. */
export function seenLabel(unixSeconds: number, nowMs: number): string {
  if (!unixSeconds) return t("devices.neverSeen");
  const at = unixSeconds * 1000;
  return `${dayLabel(at, nowMs)} ${clockLabel(at)}`;
}
