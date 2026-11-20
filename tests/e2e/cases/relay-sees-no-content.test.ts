// Spec acceptance 8: the Relay receives only a Device's public key (encrypted
// in the handshake) and ciphertext. A whole conversation runs through a real
// Relay, Host and Bridge; the Relay's frame tap is then searched for every
// marker and checked frame by frame.

import { randomBytes } from "node:crypto";

import { loadDeviceIdentity } from "@dsh-bot/client/relay";
import { afterAll, beforeAll, expect, test } from "vitest";

import { type Device, pairedDevice } from "../support/device";
import { framesContaining, readFrames, violation } from "../support/frames";
import { type Stack, startStack } from "../support/harness";

const run = randomBytes(6).toString("hex");
const marker = {
  httpRequest: `marker-http-request-${run}`,
  httpResponse: `marker-http-response-${run}`,
  muxRequest: `marker-mux-request-${run}`,
  muxResponse: `marker-mux-response-${run}`,
};

let stack: Stack;
let device: Device;

beforeAll(async () => {
  stack = await startStack({ httpReply: marker.httpResponse, muxReply: marker.muxResponse });
  device = await pairedDevice(stack, "e2e-phone");
});

afterAll(async () => {
  device?.carrier.close();
  await stack?.stop();
});

test("a conversation through the Relay leaves only ciphertext on the wire", async () => {
  // One unary call: the request and the response each carry a marker.
  const response = await device.carrier.fetch(device.url("api/echo"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ say: marker.httpRequest }),
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain(marker.httpResponse);
  expect(stack.dsh.httpBodies.join("")).toContain(marker.httpRequest);

  // One mux: a marked message each way.
  const mux = device.carrier.createWebSocket(device.url("api/remote.mux"));
  const answer = new Promise<string>((resolve, reject) => {
    mux.addEventListener("message", (event) => resolve(String(event.data)));
    mux.addEventListener("error", () => reject(new Error("mux failed")));
  });
  await new Promise<void>((resolve, reject) => {
    mux.addEventListener("open", () => resolve());
    mux.addEventListener("error", () => reject(new Error("mux did not open")));
  });
  mux.send(marker.muxRequest);
  expect(await answer).toContain(marker.muxResponse);
  expect(stack.dsh.muxMessages).toEqual([marker.muxRequest]);
  mux.close(1000, "done");

  // One cancelled stream: the Device drops a body that never ends, which sends
  // `RESET cancelled`, and the Bridge closes the loopback request.
  const slow = await device.carrier.fetch(device.url("api/slow"), { method: "POST", body: "{}" });
  expect(slow.status).toBe(200);
  await slow.body?.cancel();
  await stack.dsh.slowAbandoned;
  await stack.dsh.muxClosed;
  device.carrier.close();

  const frames = await readFrames(stack.tapPath);

  // (a) No marker, in any spelling; neither does the Device's identity.
  const identity = await loadDeviceIdentity(device.store);
  const secrets: [string, string | Uint8Array][] = [
    ...Object.entries(marker),
    ["device public key", identity.publicKey],
    ["device id", device.deviceId],
  ];
  for (const [name, secret] of secrets) {
    expect(framesContaining(frames, secret), `${name} found in a relayed frame`).toEqual([]);
  }

  // (b) The tap saw traffic, in all four directions.
  expect(frames.length).toBeGreaterThan(0);
  const directions = new Set(frames.map((frame) => `${frame.link}/${frame.dir}`));
  expect([...directions].sort()).toEqual(["bridge/in", "bridge/out", "device/in", "device/out"]);

  // (c) Every frame is a channel header or ciphertext, nothing more.
  const bad = frames
    .map((frame) => ({ seq: frame.seq, why: violation(frame) }))
    .filter((row) => row.why);
  expect(bad).toEqual([]);
});
