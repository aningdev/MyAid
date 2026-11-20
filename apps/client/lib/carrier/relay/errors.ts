// Typed failures the relay Carrier raises. The UI maps `code` to its own copy;
// the messages here stay English so no product wording lives outside
// `lib/i18n/messages.ts`.

/** Why a relay operation failed. */
export type RelayErrorCode =
  | "invalid-link"
  | "expired-link"
  | "pairing-rejected"
  | "handshake-failed"
  | "device-revoked"
  | "runner-offline"
  | "replaced"
  | "overloaded"
  | "bad-auth"
  | "too-many"
  | "idle"
  | "forbidden"
  | "protocol"
  | "unavailable"
  | "ping-timeout"
  | "closed"
  | "invalid-identity"
  | "invalid-pairing";

/** A typed relay failure; `closeCode` is the relay's WS close code when it had one. */
export class RelayError extends Error {
  readonly code: RelayErrorCode;
  readonly closeCode: number | null;

  constructor(code: RelayErrorCode, message: string, closeCode: number | null = null) {
    super(message);
    this.name = "RelayError";
    this.code = code;
    this.closeCode = closeCode;
  }
}

const BY_CLOSE_CODE: Record<number, RelayErrorCode> = {
  4001: "runner-offline",
  4002: "replaced",
  4003: "overloaded",
  4004: "bad-auth",
  4005: "too-many",
  4006: "idle",
  4010: "pairing-rejected",
  4011: "handshake-failed",
};

const MESSAGES: Record<RelayErrorCode, string> = {
  "invalid-link": "The pairing link is not valid.",
  "expired-link": "The pairing link has expired.",
  "pairing-rejected": "The Runner rejected this pairing.",
  "handshake-failed": "The encrypted handshake with the Runner failed.",
  "device-revoked": "This Device was removed from the Runner.",
  "runner-offline": "The Runner is offline.",
  replaced: "Another connection replaced this one.",
  overloaded: "The connection is overloaded.",
  "bad-auth": "The Relay refused this Device.",
  "too-many": "The Relay has too many connections.",
  idle: "The Relay closed an idle connection.",
  forbidden: "The Runner does not allow this request.",
  protocol: "The Runner sent a frame this Device cannot handle.",
  unavailable: "The Runner cannot reach dsh web.",
  "ping-timeout": "The Runner stopped answering.",
  closed: "The connection to the Runner closed.",
  "invalid-identity": "The stored Device key is damaged.",
  "invalid-pairing": "The stored pairing is damaged.",
};

/** The typed failure for a relay close code, or `closed` for 1000 and unknown codes. */
export function errorForCloseCode(code: number | null): RelayError {
  const mapped = code === null ? undefined : BY_CLOSE_CODE[code];
  if (!mapped) return new RelayError("closed", MESSAGES.closed, code);
  return new RelayError(mapped, MESSAGES[mapped], code);
}

export function relayError(code: RelayErrorCode, closeCode: number | null = null): RelayError {
  return new RelayError(code, MESSAGES[code], closeCode);
}

/** Whether a frame body's `{"code":…}` is one of the four RESET codes. */
export function isResetCode(code: unknown): code is "forbidden" | "protocol" | "overloaded" | "unavailable" {
  return code === "forbidden" || code === "protocol" || code === "overloaded" || code === "unavailable";
}
