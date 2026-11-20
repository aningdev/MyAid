// The Noise subset the relay tunnel uses: the IK and IKpsk1 initiator, plus the
// responder the tests (and only the tests) need to answer it. The transcript
// follows the Noise Protocol Framework, revision 34, and the tunnel contract in
// `docs/architecture/relay-tunnel.md`.

import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";

import { concatBytes, randomBytes, u64le, utf8Encode } from "./bytes";

/** `Noise_IK_25519_ChaChaPoly_SHA256`, the daily tunnel. */
export const NOISE_IK = "Noise_IK_25519_ChaChaPoly_SHA256";
/** `Noise_IKpsk1_25519_ChaChaPoly_SHA256`, pairing with the link's psk. */
export const NOISE_IKPSK1 = "Noise_IKpsk1_25519_ChaChaPoly_SHA256";

const EMPTY = new Uint8Array(0);
const MAX_NONCE = (1n << 64n) - 1n;

/** A 32-byte X25519 key pair. */
export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export type RandomSource = (length: number) => Uint8Array;

export function keyPairFromPrivate(privateKey: Uint8Array): KeyPair {
  if (privateKey.length !== 32) throw new RangeError("an X25519 private key is 32 bytes");
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
}

export function generateKeyPair(random: RandomSource = randomBytes): KeyPair {
  return keyPairFromPrivate(random(32));
}

function dh(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) throw new RangeError("an X25519 public key is 32 bytes");
  const shared = x25519.getSharedSecret(privateKey, publicKey);
  if (shared.every((byte) => byte === 0)) throw new Error("X25519 shared secret is all zero");
  return shared;
}

function hash(data: Uint8Array): Uint8Array {
  return sha256(data);
}

/** HKDF as Noise defines it: `num` chained HMAC outputs under `chainingKey`. */
function hkdf(chainingKey: Uint8Array, inputKeyMaterial: Uint8Array, num: number): Uint8Array[] {
  const tempKey = hmac(sha256, chainingKey, inputKeyMaterial);
  const outputs: Uint8Array[] = [];
  let previous = EMPTY;
  for (let i = 1; i <= num; i++) {
    previous = hmac(sha256, tempKey, concatBytes(previous, new Uint8Array([i])));
    outputs.push(previous);
  }
  return outputs;
}

function pad32(name: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  out.set(name);
  return out;
}

/** A Noise cipher state: a key, a nonce counter, and AEAD with associated data. */
export class CipherState {
  private key: Uint8Array | null = null;
  private nonce = 0n;

  initializeKey(key: Uint8Array | null): void {
    this.key = key;
    this.nonce = 0n;
  }

  hasKey(): boolean {
    return this.key !== null;
  }

  get nonceValue(): bigint {
    return this.nonce;
  }

  encryptWithAd(associatedData: Uint8Array, plaintext: Uint8Array): Uint8Array {
    if (!this.key) return plaintext;
    if (this.nonce >= MAX_NONCE) throw new Error("Noise nonce exhausted");
    const ciphertext = chacha20poly1305(this.key, this.nonceBytes(), associatedData).encrypt(plaintext);
    this.nonce += 1n;
    return ciphertext;
  }

  decryptWithAd(associatedData: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    if (!this.key) return ciphertext;
    if (this.nonce >= MAX_NONCE) throw new Error("Noise nonce exhausted");
    const plaintext = chacha20poly1305(this.key, this.nonceBytes(), associatedData).decrypt(ciphertext);
    this.nonce += 1n;
    return plaintext;
  }

  private nonceBytes(): Uint8Array {
    const out = new Uint8Array(12);
    out.set(u64le(this.nonce), 4);
    return out;
  }
}

/** The handshake's chaining key, transcript hash and current cipher state. */
export class SymmetricState {
  private chainingKey: Uint8Array;
  private transcript: Uint8Array;
  private readonly cipher = new CipherState();

  constructor(protocolName: string) {
    const name = utf8Encode(protocolName);
    this.transcript = name.length <= 32 ? pad32(name) : hash(name);
    this.chainingKey = this.transcript;
  }

  get handshakeHash(): Uint8Array {
    return this.transcript;
  }

  mixHash(data: Uint8Array): void {
    this.transcript = hash(concatBytes(this.transcript, data));
  }

  mixKey(inputKeyMaterial: Uint8Array): void {
    const [chainingKey, tempKey] = hkdf(this.chainingKey, inputKeyMaterial, 2);
    this.chainingKey = chainingKey;
    this.cipher.initializeKey(tempKey);
  }

  mixKeyAndHash(inputKeyMaterial: Uint8Array): void {
    const [chainingKey, tempHash, tempKey] = hkdf(this.chainingKey, inputKeyMaterial, 3);
    this.chainingKey = chainingKey;
    this.mixHash(tempHash);
    this.cipher.initializeKey(tempKey);
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const ciphertext = this.cipher.encryptWithAd(this.transcript, plaintext);
    this.mixHash(ciphertext);
    return ciphertext;
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    const plaintext = this.cipher.decryptWithAd(this.transcript, ciphertext);
    this.mixHash(ciphertext);
    return plaintext;
  }

  /** The two transport ciphers, in order: the initiator's send is the first. */
  split(): [CipherState, CipherState] {
    const [first, second] = hkdf(this.chainingKey, EMPTY, 2);
    const one = new CipherState();
    const two = new CipherState();
    one.initializeKey(first);
    two.initializeKey(second);
    return [one, two];
  }
}

type Token = "e" | "es" | "s" | "ss" | "ee" | "se" | "psk";

const PATTERNS: Record<string, Token[][]> = {
  [NOISE_IK]: [["e", "es", "s", "ss"], ["e", "ee", "se"]],
  [NOISE_IKPSK1]: [["e", "es", "s", "ss", "psk"], ["e", "ee", "se"]],
};

export type NoiseRole = "initiator" | "responder";

export interface HandshakeOptions {
  protocol: typeof NOISE_IK | typeof NOISE_IKPSK1;
  role: NoiseRole;
  /** Mixed into the transcript before the pre-messages; the tunnel passes its contract prologue. */
  prologue: Uint8Array;
  staticKey: KeyPair;
  /** The responder's static public key; required of the initiator, learned in message 1 by the responder. */
  remoteStatic?: Uint8Array;
  /** Fixed ephemeral for a test vector; when absent a fresh one is generated per handshake. */
  ephemeralKey?: KeyPair;
  /** The 32-byte psk, required by IKpsk1 and rejected by IK. */
  psk?: Uint8Array;
  random?: RandomSource;
}

/** One side of an IK or IKpsk1 handshake, writing and reading its messages in order. */
export class HandshakeState {
  private readonly symmetric: SymmetricState;
  private readonly pattern: Token[][];
  private readonly role: NoiseRole;
  private readonly localStatic: KeyPair;
  private readonly psk: Uint8Array | undefined;
  private readonly random: RandomSource;
  private readonly fixedEphemeral: KeyPair | undefined;
  private remoteStatic: Uint8Array | undefined;
  private localEphemeral: KeyPair | undefined;
  private remoteEphemeral: Uint8Array | undefined;
  private messageIndex = 0;

  constructor(options: HandshakeOptions) {
    this.pattern = PATTERNS[options.protocol];
    if (!this.pattern) throw new Error(`unsupported Noise protocol: ${options.protocol}`);
    this.role = options.role;
    this.localStatic = options.staticKey;
    this.fixedEphemeral = options.ephemeralKey;
    this.psk = options.psk;
    this.random = options.random ?? randomBytes;
    if (options.protocol === NOISE_IKPSK1) {
      if (!this.psk || this.psk.length !== 32) throw new Error("IKpsk1 needs a 32-byte psk");
    } else if (this.psk) {
      throw new Error("IK takes no psk");
    }

    this.symmetric = new SymmetricState(options.protocol);
    this.symmetric.mixHash(options.prologue);
    if (this.role === "initiator") {
      if (!options.remoteStatic) throw new Error("the IK initiator needs the responder's static key");
      this.remoteStatic = options.remoteStatic;
      this.symmetric.mixHash(this.remoteStatic);
    } else {
      this.symmetric.mixHash(this.localStatic.publicKey);
    }
  }

  get handshakeHash(): Uint8Array {
    return this.symmetric.handshakeHash;
  }

  /** PSK handshakes also mix each `e` public key into the key. */
  private get usesPsk(): boolean {
    return this.pattern.some((tokens) => tokens.includes("psk"));
  }

  /** True while the handshake still has a message to write or read. */
  get complete(): boolean {
    return this.messageIndex >= this.pattern.length;
  }

  /** Encrypts this side's next handshake message, carrying `payload`. */
  writeMessage(payload: Uint8Array = EMPTY): Uint8Array {
    const tokens = this.expectMessage("write");
    const parts: Uint8Array[] = [];
    for (const token of tokens) {
      switch (token) {
        case "e": {
          const ephemeral = this.fixedEphemeral ?? generateKeyPair(this.random);
          this.localEphemeral = ephemeral;
          parts.push(ephemeral.publicKey);
          this.symmetric.mixHash(ephemeral.publicKey);
          if (this.usesPsk) this.symmetric.mixKey(ephemeral.publicKey);
          break;
        }
        case "s":
          parts.push(this.symmetric.encryptAndHash(this.localStatic.publicKey));
          break;
        case "es":
          this.symmetric.mixKey(this.tokenDh("es"));
          break;
        case "ee":
          this.symmetric.mixKey(this.tokenDh("ee"));
          break;
        case "se":
          this.symmetric.mixKey(this.tokenDh("se"));
          break;
        case "ss":
          this.symmetric.mixKey(this.tokenDh("ss"));
          break;
        case "psk":
          this.symmetric.mixKeyAndHash(this.requirePsk());
          break;
      }
    }
    parts.push(this.symmetric.encryptAndHash(payload));
    this.messageIndex += 1;
    return concatBytes(...parts);
  }

  /** Decrypts the peer's next handshake message and returns its payload. */
  readMessage(message: Uint8Array): Uint8Array {
    const tokens = this.expectMessage("read");
    let offset = 0;
    for (const token of tokens) {
      switch (token) {
        case "e": {
          const publicKey = message.slice(offset, offset + 32);
          if (publicKey.length !== 32) throw new Error("Noise message ended before its ephemeral key");
          offset += 32;
          this.remoteEphemeral = publicKey;
          this.symmetric.mixHash(publicKey);
          if (this.usesPsk) this.symmetric.mixKey(publicKey);
          break;
        }
        case "s": {
          const ciphertext = message.slice(offset, offset + 48);
          if (ciphertext.length !== 48) throw new Error("Noise message ended before its static key");
          offset += 48;
          this.remoteStatic = this.symmetric.decryptAndHash(ciphertext);
          break;
        }
        case "es":
        case "ee":
        case "se":
        case "ss":
          this.symmetric.mixKey(this.tokenDh(token));
          break;
        case "psk":
          this.symmetric.mixKeyAndHash(this.requirePsk());
          break;
      }
    }
    const remaining = message.slice(offset);
    this.messageIndex += 1;
    return this.symmetric.decryptAndHash(remaining);
  }

  /** The transport ciphers once the handshake is complete. */
  split(): { send: CipherState; receive: CipherState } {
    if (!this.complete) throw new Error("the Noise handshake is not complete");
    const [first, second] = this.symmetric.split();
    return this.role === "initiator" ? { send: first, receive: second } : { send: second, receive: first };
  }

  private expectMessage(operation: "write" | "read"): Token[] {
    const expected = this.messageIndex % 2 === (this.role === "initiator" ? 0 : 1) ? "write" : "read";
    if (operation !== expected) throw new Error(`this side must ${expected} message ${this.messageIndex + 1}`);
    return this.pattern[this.messageIndex];
  }

  private requirePsk(): Uint8Array {
    if (!this.psk) throw new Error("this handshake has no psk");
    return this.psk;
  }

  private tokenDh(token: Exclude<Token, "e" | "s" | "psk">): Uint8Array {
    if (token === "ee") {
      return dh(this.requireLocalEphemeral().privateKey, this.requireRemoteEphemeral());
    }
    if (token === "es") {
      // Initiator writes it with its ephemeral and the responder's static;
      // the responder reads it with its static and the initiator's ephemeral.
      return this.role === "initiator"
        ? dh(this.requireLocalEphemeral().privateKey, this.requireRemoteStatic())
        : dh(this.localStatic.privateKey, this.requireRemoteEphemeral());
    }
    if (token === "se") {
      // Initiator reads it with its static and the responder's ephemeral;
      // the responder writes it with its ephemeral and the initiator's static.
      return this.role === "initiator"
        ? dh(this.localStatic.privateKey, this.requireRemoteEphemeral())
        : dh(this.requireLocalEphemeral().privateKey, this.requireRemoteStatic());
    }
    return dh(this.localStatic.privateKey, this.requireRemoteStatic());
  }

  private requireLocalEphemeral(): KeyPair {
    if (!this.localEphemeral) throw new Error("this side has no ephemeral key yet");
    return this.localEphemeral;
  }

  private requireRemoteEphemeral(): Uint8Array {
    if (!this.remoteEphemeral) throw new Error("the peer's ephemeral key has not arrived");
    return this.remoteEphemeral;
  }

  private requireRemoteStatic(): Uint8Array {
    if (!this.remoteStatic) throw new Error("the peer's static key is unknown");
    return this.remoteStatic;
  }
}
