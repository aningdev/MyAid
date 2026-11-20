// Byte helpers the relay Carrier shares: no platform APIs beyond `crypto`,
// so the same code runs in the nsh runtime and in tests.

import { sha256 } from "@noble/hashes/sha2.js";

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** Concatenates byte strings without spreading them into argument lists. */
export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** A big-endian u32, the width of a stream number and of a frame length. */
export function u32be(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`u32 out of range: ${value}`);
  }
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

export function readU32be(bytes: Uint8Array, offset = 0): number {
  if (offset + 4 > bytes.length) throw new RangeError("u32 past the end of the buffer");
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

/** Eight little-endian bytes of a Noise nonce counter. */
export function u64le(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let rest = value;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

/** base64url without padding, as pairing links and stored records use. */
export function b64urlEncode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += BASE64URL[(n >>> 18) & 63] + BASE64URL[(n >>> 12) & 63];
    out += BASE64URL[(n >>> 6) & 63] + BASE64URL[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += BASE64URL[(n >>> 18) & 63] + BASE64URL[(n >>> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += BASE64URL[(n >>> 18) & 63] + BASE64URL[(n >>> 12) & 63];
    out += BASE64URL[(n >>> 6) & 63];
  }
  return out;
}

/** Rejects padding, whitespace and the standard alphabet's `+` and `/`. */
export function b64urlDecode(text: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of text) {
    const value = BASE64URL.indexOf(char);
    if (value < 0) throw new TypeError(`not base64url: ${JSON.stringify(text)}`);
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >>> bits) & 0xff);
    }
  }
  if (bits > 0 && (buffer & ((1 << bits) - 1)) !== 0) {
    throw new TypeError("base64url text has non-zero padding bits");
  }
  if (text.length % 4 === 1) throw new TypeError("base64url text has an impossible length");
  return new Uint8Array(out);
}

/** Lowercase base32 without padding, the form of a runner or device id. */
export function base32Lower(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += BASE32[(buffer >>> bits) & 31];
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}

/** The public id of a static key: sha256's first 20 bytes in lowercase base32. */
export function publicId(publicKey: Uint8Array): string {
  return base32Lower(sha256(publicKey).slice(0, 20));
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Random bytes from the runtime's cryptographic source. */
export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}
