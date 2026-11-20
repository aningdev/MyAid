// Runs the relay tunnel's cryptography in the nsh runtime itself: BigInt
// nonces, `crypto.getRandomValues`, X25519, ChaCha20-Poly1305 and SHA-256/HMAC.
// It also measures a complete IK handshake, the budget set in the task.

import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { expect, test } from "nsh/test";

import { utf8Encode } from "./bytes";
import { HandshakeState, NOISE_IK, generateKeyPair } from "./noise";
import { toHex } from "./test-support/hex";

test("noble primitives run in the nsh runtime", () => {
  const first = generateKeyPair();
  const second = generateKeyPair();
  expect(toHex(x25519.getSharedSecret(first.privateKey, second.publicKey))).toBe(
    toHex(x25519.getSharedSecret(second.privateKey, first.publicKey)),
  );

  const key = new Uint8Array(32).fill(3);
  const nonce = new Uint8Array(12).fill(4);
  const aad = utf8Encode("aad");
  const cipher = chacha20poly1305(key, nonce, aad);
  const sealed = cipher.encrypt(utf8Encode("payload"));
  expect(new TextDecoder().decode(chacha20poly1305(key, nonce, aad).decrypt(sealed))).toBe(
    "payload",
  );

  expect(toHex(sha256(utf8Encode("abc")))).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  expect(toHex(hmac(sha256, new Uint8Array(20).fill(0x0b), utf8Encode("Hi There")))).toBe(
    "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
  );
  expect(10n ** 20n).toBe(100000000000000000000n);
});

test("a complete IK handshake stays under the 500 ms budget", () => {
  const started = Date.now();
  const device = generateKeyPair();
  const runner = generateKeyPair();
  const prologue = utf8Encode("dsh-bot-tunnel/1" + "f".repeat(32));
  const initiator = new HandshakeState({
    protocol: NOISE_IK,
    role: "initiator",
    prologue,
    staticKey: device,
    remoteStatic: runner.publicKey,
  });
  const responder = new HandshakeState({
    protocol: NOISE_IK,
    role: "responder",
    prologue,
    staticKey: runner,
  });
  const first = initiator.writeMessage(utf8Encode("{}"));
  responder.readMessage(first);
  const second = responder.writeMessage(utf8Encode('{"ok":true}'));
  initiator.readMessage(second);
  initiator.split();
  responder.split();
  const elapsed = Date.now() - started;
  console.log(`IK handshake, two messages: ${elapsed} ms`);
  expect(elapsed).toBeLessThan(500);
});
