// The tap reader's own checks: the search must find a marker however a frame
// spells it, or "not found" in the Relay test would prove nothing.

import { expect, test } from "vitest";

import { framesContaining, type TappedFrame, violation } from "../support/frames";

function frame(seq: number, bytes: Buffer, link: TappedFrame["link"] = "device"): TappedFrame {
  return { seq, link, dir: "in", bytes };
}

test("a marker is found raw and in base64 or base64url at any alignment", () => {
  const secret = "marker-0123456789abcdef";
  const frames: TappedFrame[] = [];
  let seq = 0;
  for (let pad = 0; pad < 3; pad++) {
    const bytes = Buffer.from("x".repeat(pad) + secret + "tail");
    frames.push(frame(seq++, Buffer.from(bytes.toString("base64"))));
    frames.push(frame(seq++, Buffer.from(bytes.toString("base64url"))));
    frames.push(frame(seq++, bytes));
  }
  expect(framesContaining(frames, secret)).toEqual(frames.map((entry) => entry.seq));
  expect(framesContaining([frame(0, Buffer.from("nothing here at all"))], secret)).toEqual([]);
});

test("a frame that is not a channel header or ciphertext is a violation", () => {
  const header = (type: number, payload: number) =>
    Buffer.concat([Buffer.from([0, 0, 0, 7, type]), Buffer.alloc(payload, 1)]);
  expect(violation(frame(0, header(1, 0), "bridge"))).toBeNull();
  expect(violation(frame(0, header(2, 40), "bridge"))).toBeNull();
  expect(violation(frame(0, header(3, 2), "bridge"))).toBeNull();
  expect(violation(frame(0, header(1, 3), "bridge"))).not.toBeNull();
  expect(violation(frame(0, header(2, 4), "bridge"))).not.toBeNull();
  expect(violation(frame(0, header(9, 40), "bridge"))).not.toBeNull();
  expect(violation(frame(0, Buffer.alloc(8)))).not.toBeNull();
  expect(violation(frame(0, Buffer.alloc(48)))).toBeNull();
});
