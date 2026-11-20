import { expect, test } from "nsh/test";

import { utf8Decode, utf8Encode } from "./bytes";
import {
  NOISE_IKPSK1,
  NOISE_IK,
  HandshakeState,
  generateKeyPair,
  keyPairFromPrivate,
} from "./noise";
import { fromHex, toHex } from "./test-support/hex";
import { NOISE_VECTORS } from "./test-support/noise-vectors";

const EMPTY = new Uint8Array(0);

function protocolOf(name: string): typeof NOISE_IK | typeof NOISE_IKPSK1 {
  if (name === NOISE_IK || name === NOISE_IKPSK1) return name;
  throw new Error(`unexpected vector protocol ${name}`);
}

for (const vector of NOISE_VECTORS) {
  test(`${vector.protocol_name} matches the ${vector.source} vector`, () => {
    const psk = vector.init_psks?.[0] ? fromHex(vector.init_psks[0]) : undefined;
    const protocol = protocolOf(vector.protocol_name);
    const initiator = new HandshakeState({
      protocol,
      role: "initiator",
      prologue: fromHex(vector.init_prologue),
      staticKey: keyPairFromPrivate(fromHex(vector.init_static)),
      remoteStatic: fromHex(vector.init_remote_static),
      ephemeralKey: keyPairFromPrivate(fromHex(vector.init_ephemeral)),
      psk,
    });
    const responder = new HandshakeState({
      protocol,
      role: "responder",
      prologue: fromHex(vector.resp_prologue),
      staticKey: keyPairFromPrivate(fromHex(vector.resp_static)),
      ephemeralKey: keyPairFromPrivate(fromHex(vector.resp_ephemeral)),
      psk,
    });

    const first = initiator.writeMessage(fromHex(vector.messages[0].payload));
    expect(toHex(first)).toBe(vector.messages[0].ciphertext);
    expect(toHex(responder.readMessage(first))).toBe(vector.messages[0].payload);
    const second = responder.writeMessage(fromHex(vector.messages[1].payload));
    expect(toHex(second)).toBe(vector.messages[1].ciphertext);
    expect(toHex(initiator.readMessage(second))).toBe(vector.messages[1].payload);

    if (vector.handshake_hash) {
      expect(toHex(initiator.handshakeHash)).toBe(vector.handshake_hash);
      expect(toHex(responder.handshakeHash)).toBe(vector.handshake_hash);
    }

    const initiatorTransport = initiator.split();
    const responderTransport = responder.split();
    for (let index = 2; index < vector.messages.length; index++) {
      const payload = fromHex(vector.messages[index].payload);
      const expected = vector.messages[index].ciphertext;
      if (index % 2 === 0) {
        const ciphertext = initiatorTransport.send.encryptWithAd(EMPTY, payload);
        expect(toHex(ciphertext)).toBe(expected);
        expect(toHex(responderTransport.receive.decryptWithAd(EMPTY, ciphertext))).toBe(
          vector.messages[index].payload,
        );
      } else {
        const ciphertext = responderTransport.send.encryptWithAd(EMPTY, payload);
        expect(toHex(ciphertext)).toBe(expected);
        expect(toHex(initiatorTransport.receive.decryptWithAd(EMPTY, ciphertext))).toBe(
          vector.messages[index].payload,
        );
      }
    }
  });
}

test("a handshake with fresh keys carries both payloads and transport traffic", () => {
  const device = generateKeyPair();
  const runner = generateKeyPair();
  const psk = new Uint8Array(32).fill(7);
  const prologue = utf8Encode("dsh-bot-tunnel/1" + "runner");

  const deviceSide = new HandshakeState({
    protocol: NOISE_IKPSK1,
    role: "initiator",
    prologue,
    staticKey: device,
    remoteStatic: runner.publicKey,
    psk,
  });
  const runnerSide = new HandshakeState({
    protocol: NOISE_IKPSK1,
    role: "responder",
    prologue,
    staticKey: runner,
    psk,
  });

  const hello = deviceSide.writeMessage(utf8Encode('{"name":"Test Device"}'));
  expect(utf8Decode(runnerSide.readMessage(hello))).toBe('{"name":"Test Device"}');
  const accepted = runnerSide.writeMessage(utf8Encode('{"ok":true,"deviceId":"abc"}'));
  expect(utf8Decode(deviceSide.readMessage(accepted))).toBe('{"ok":true,"deviceId":"abc"}');

  const deviceTransport = deviceSide.split();
  const runnerTransport = runnerSide.split();
  const frame = deviceTransport.send.encryptWithAd(EMPTY, utf8Encode("request"));
  expect(utf8Decode(runnerTransport.receive.decryptWithAd(EMPTY, frame))).toBe("request");

  // Pairing learns the Device's static public key from the encrypted static token.
  expect(toHex(runnerSide.handshakeHash)).toBe(toHex(deviceSide.handshakeHash));
});

test("a tampered handshake message is rejected", () => {
  const device = generateKeyPair();
  const runner = generateKeyPair();
  const prologue = new Uint8Array(0);
  const deviceSide = new HandshakeState({
    protocol: NOISE_IK,
    role: "initiator",
    prologue,
    staticKey: device,
    remoteStatic: runner.publicKey,
  });
  const runnerSide = new HandshakeState({
    protocol: NOISE_IK,
    role: "responder",
    prologue,
    staticKey: runner,
  });
  const message = deviceSide.writeMessage(EMPTY);
  message[message.length - 1] ^= 1;
  expect(() => runnerSide.readMessage(message)).toThrow();
});
