// Reads the Relay's frame-tap file and answers what a Relay could learn from it.

import { readFile } from "node:fs/promises";

export interface TappedFrame {
  seq: number;
  link: "bridge" | "device";
  dir: "in" | "out";
  bytes: Buffer;
}

const OPEN = 1;
const DATA = 2;
const CLOSE = 3;
/** Bridge↔Relay frames: u32 channel, u8 type, payload. */
const HEADER = 5;
/** A Device's message may be 65 535 bytes of Noise plus the mode byte at most. */
const MAX_DEVICE_MESSAGE = 65_600 - 4 - 1;
/** Every Noise message ends in a 16-byte authentication tag. */
const TAG = 16;

export async function readFrames(path: string): Promise<TappedFrame[]> {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const row = JSON.parse(line) as { seq: number; link: string; dir: string; bytes: string };
      if (row.link !== "bridge" && row.link !== "device") throw new Error(`link ${row.link}`);
      if (row.dir !== "in" && row.dir !== "out") throw new Error(`dir ${row.dir}`);
      return {
        seq: row.seq,
        link: row.link,
        dir: row.dir,
        bytes: Buffer.from(row.bytes, "base64url"),
      };
    });
}

/** Every spelling of `secret` a byte string could hide it in: raw, base64 and base64url at all three alignments. */
export function spellings(secret: string | Uint8Array): Buffer[] {
  const raw = typeof secret === "string" ? Buffer.from(secret, "utf8") : Buffer.from(secret);
  const found: Buffer[] = [raw];
  for (let pad = 0; pad < 3; pad++) {
    const padded = Buffer.concat([Buffer.alloc(pad), raw]);
    // The first characters depend on the bytes before the secret, the last on those after it.
    const skip = [0, 2, 3][pad] ?? 0;
    const drop = [0, 2, 1][padded.length % 3] ?? 0;
    for (const encoding of ["base64", "base64url"] as const) {
      const encoded = padded.toString(encoding).replace(/=+$/, "");
      found.push(Buffer.from(encoded.slice(skip, encoded.length - drop), "utf8"));
    }
  }
  return found;
}

/** The sequence numbers of the frames in which `secret` appears, in any spelling. */
export function framesContaining(frames: TappedFrame[], secret: string | Uint8Array): number[] {
  const needles = spellings(secret);
  return frames
    .filter((frame) => needles.some((needle) => frame.bytes.includes(needle)))
    .map((frame) => frame.seq);
}

/**
 * Why a frame is not what a Relay is allowed to see, or `null` when it is:
 * a channel header plus ciphertext on the Runner link, ciphertext alone on
 * the Device link. See relay-tunnel.md, "帧".
 */
export function violation(frame: TappedFrame): string | null {
  const { bytes } = frame;
  if (frame.link === "device") {
    if (bytes.length <= TAG) return "a Device message shorter than a Noise tag";
    if (bytes.length > MAX_DEVICE_MESSAGE) return "a Device message over the limit";
    return null;
  }
  if (bytes.length < HEADER) return "a Runner frame shorter than its header";
  const type = bytes[4];
  const payload = bytes.length - HEADER;
  if (type === OPEN) return payload === 0 ? null : "OPEN with a payload";
  if (type === CLOSE) return payload === 2 ? null : "CLOSE without exactly a close code";
  if (type === DATA) return payload > TAG ? null : "DATA without ciphertext";
  return `unknown frame type ${type}`;
}
