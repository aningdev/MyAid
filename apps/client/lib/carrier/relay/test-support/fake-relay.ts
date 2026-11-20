// A Relay and Bridge peer in memory: it answers the Device's handshake with a
// Noise responder, then speaks the contract's frame format. Tests use it to
// drive the tunnel without a socket, and read `wire` to prove it stays opaque.

import { concatBytes, publicId, readU32be, u32be, utf8Decode, utf8Encode } from "../bytes";
import { HandshakeState, type KeyPair, NOISE_IK, NOISE_IKPSK1 } from "../noise";
import type { TunnelConnection, TunnelConnector } from "../tunnel";

const PROLOGUE = "dsh-bot-tunnel/1";

export interface FakeFrame {
  stream: number;
  type: number;
  body: Uint8Array;
}

export interface FakeRelayOptions {
  mode: "daily" | "pair";
  runner: KeyPair;
  runnerId: string;
  deviceId: string;
  psk?: Uint8Array;
  /** Daily mode only: answer `device-revoked`. */
  revoked?: boolean;
  /** Close the websocket instead of answering the handshake. */
  rejectCloseCode?: number;
  /** Answer stream-0 pings; `false` lets the Device's pong timer run out. */
  answerPings?: boolean;
  /** Called for every transport frame after it is recorded. */
  onFrame?: (frame: FakeFrame) => void;
}

class DuplexEnd implements TunnelConnection {
  private queue: (string | Uint8Array)[] = [];
  private waiting: ((value: string | Uint8Array | null) => void) | null = null;
  private closed = false;
  private remoteClosed = false;
  private code: number | null = null;
  peer!: DuplexEnd;

  read(): Promise<string | Uint8Array | null> {
    const next = this.queue.shift();
    if (next !== undefined) return Promise.resolve(next);
    if (this.closed || this.remoteClosed) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }

  async write(data: string | Uint8Array): Promise<void> {
    if (this.closed) throw new Error("socket closed");
    this.peer.deliver(data);
  }

  async close(code = 1000): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.code = code;
    this.peer.code = code;
    this.peer.remoteClosed = true;
    this.wake();
    this.peer.wake();
  }

  dispose(): void {}

  get closeCode(): number | null {
    return this.code;
  }

  get closeReason(): string | null {
    return null;
  }

  private deliver(data: string | Uint8Array): void {
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = null;
      waiting(data);
    } else {
      this.queue.push(data);
    }
  }

  private wake(): void {
    const waiting = this.waiting;
    if (waiting) {
      this.waiting = null;
      waiting(null);
    }
  }
}

function duplexPair(): [DuplexEnd, DuplexEnd] {
  const client = new DuplexEnd();
  const relay = new DuplexEnd();
  client.peer = relay;
  relay.peer = client;
  return [client, relay];
}

function asBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? utf8Encode(data) : data;
}

/** The peer side of a tunnel; construct it before calling `openTunnel`. */
export class FakeRelay {
  readonly client: DuplexEnd;
  /** Every websocket message the Device sent, handshake included. */
  readonly wire: Uint8Array[] = [];
  /** Every transport frame the Device sent. */
  readonly frames: FakeFrame[] = [];
  /** The pairing payload the Device sent, if any. */
  pairingPayload: Record<string, unknown> | null = null;

  private readonly relay: DuplexEnd;
  private readonly options: FakeRelayOptions;
  private send: import("../noise").CipherState | null = null;
  private receive: import("../noise").CipherState | null = null;

  constructor(options: FakeRelayOptions) {
    this.options = options;
    [this.client, this.relay] = duplexPair();
    void this.accept();
  }

  get connector(): TunnelConnector {
    return () => Promise.resolve(this.client);
  }

  private async accept(): Promise<void> {
    const first = await this.relay.read();
    if (first === null) return;
    const bytes = asBytes(first);
    this.wire.push(bytes);
    if (bytes[0] !== (this.options.mode === "daily" ? 1 : 2)) {
      await this.relay.close(this.options.rejectCloseCode ?? 4011);
      return;
    }

    const protocol = this.options.mode === "daily" ? NOISE_IK : NOISE_IKPSK1;
    const handshake = new HandshakeState({
      protocol,
      role: "responder",
      prologue: concatBytes(utf8Encode(PROLOGUE), Uint8Array.of(bytes[0]), utf8Encode(this.options.runnerId)),
      staticKey: this.options.runner,
      psk: this.options.mode === "pair" ? this.options.psk : undefined,
    });
    let payload: Uint8Array;
    try {
      payload = handshake.readMessage(bytes.slice(1));
    } catch {
      await this.relay.close(this.options.rejectCloseCode ?? 4011);
      return;
    }
    if (this.options.mode === "pair") {
      this.pairingPayload = JSON.parse(utf8Decode(payload)) as Record<string, unknown>;
    }

    if (this.options.rejectCloseCode !== undefined) {
      await this.relay.close(this.options.rejectCloseCode);
      return;
    }

    const answer =
      this.options.mode === "daily"
        ? this.options.revoked
          ? { ok: false, error: "device-revoked" }
          : { ok: true }
        : { ok: true, deviceId: this.options.deviceId };
    const second = handshake.writeMessage(utf8Encode(JSON.stringify(answer)));
    this.wire.push(second);
    await this.relay.write(second);

    const ciphers = handshake.split();
    this.send = ciphers.send;
    this.receive = ciphers.receive;

    for (;;) {
      const data = await this.relay.read();
      if (data === null) return;
      const plaintext = this.receive.decryptWithAd(new Uint8Array(0), asBytes(data));
      const stream = readU32be(plaintext);
      const type = plaintext[4];
      const body = plaintext.slice(5);
      if (stream === 0 && type === 11) {
        const control = JSON.parse(utf8Decode(body)) as { type?: string };
        if (control.type === "ping" && this.options.answerPings !== false) this.sendFrame(0, 11, utf8Encode('{"type":"pong"}'));
        continue;
      }
      const frame = { stream, type, body };
      this.frames.push(frame);
      this.options.onFrame?.(frame);
    }
  }

  /** Sends a transport frame to the Device. */
  sendFrame(stream: number, type: number, body: Uint8Array = new Uint8Array(0)): void {
    if (!this.send) throw new Error("the handshake has not finished");
    const plaintext = concatBytes(u32be(stream), Uint8Array.of(type), body);
    const message = this.send.encryptWithAd(new Uint8Array(0), plaintext);
    this.wire.push(message);
    void this.relay.write(message);
  }

  /** Waits until a frame of `type` on any stream arrives, then returns it. */
  async nextFrame(): Promise<FakeFrame> {
    for (;;) {
      const frame = this.frames.shift();
      if (frame) return frame;
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }

  async close(code: number): Promise<void> {
    await this.relay.close(code);
  }

  /** The device id the Runner derived from the Device's static key. */
  get id(): string {
    return this.options.deviceId;
  }
}

export { publicId };
