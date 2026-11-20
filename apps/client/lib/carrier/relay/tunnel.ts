// One Relay websocket carrying the Noise tunnel: the Device's first message
// (mode byte plus Noise message 1), then stream frames of the form
// `[u32 stream][u8 type][body]`. The carrier above owns streams; this module
// owns the socket, the handshake, keepalive and framing.

import { connect, type WebSocketConnection } from "websocket";

import { concatBytes, publicId, readU32be, u32be, utf8Decode, utf8Encode } from "./bytes";
import { errorForCloseCode, RelayError, relayError } from "./errors";
import { type CipherState, HandshakeState, type KeyPair, NOISE_IK, NOISE_IKPSK1 } from "./noise";

/** The largest plaintext a single Noise transport message may carry. */
export const MAX_FRAME_PLAINTEXT = 65535;
/** The largest body a frame can carry, after its five-byte header. */
export const MAX_FRAME_BODY = MAX_FRAME_PLAINTEXT - 5;

const TUNNEL_PROLOGUE = "dsh-bot-tunnel/1";
const MODE_DAILY = 1;
const MODE_PAIR = 2;
const CONTROL_STREAM = 0;
const TYPE_CONTROL = 11;
const DEFAULT_PING_INTERVAL_MS = 15_000;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 15_000;
const MISSED_PONGS = 2;

const EMPTY = new Uint8Array(0);

/** The connection surface the tunnel needs; nsh's `connect` returns one. */
export interface TunnelConnection {
  read(): Promise<string | Uint8Array | null>;
  write(data: string | Uint8Array): Promise<void>;
  close(code?: number | null, reason?: string | null): Promise<void>;
  readonly closeCode: number | null;
  readonly closeReason: string | null;
  dispose(): void;
}

export type TunnelConnector = (url: string) => Promise<TunnelConnection>;

/** The two things a tunnel does for the carrier above it. */
export interface TunnelHandlers {
  /** A frame for a stream other than the control stream. */
  onFrame(stream: number, type: number, body: Uint8Array): void;
  /** The tunnel ended; the handler clears every stream it opened. */
  onClose(error: RelayError): void;
}

interface TunnelOptionsBase {
  relayUrl: string;
  runnerId: string;
  /** The Runner's static public key from the pairing link. */
  runnerKey: Uint8Array;
  /** The Device's static key pair; its public id is the device id. */
  identity: KeyPair;
  pingIntervalMs?: number;
  handshakeTimeoutMs?: number;
  /** A test seam; the default dials the Relay through nsh's `websocket`. */
  connect?: TunnelConnector;
}

export interface DailyTunnelOptions extends TunnelOptionsBase {
  mode: "daily";
}

export interface PairTunnelOptions extends TunnelOptionsBase {
  mode: "pair";
  psk: Uint8Array;
  /** Sent to the Runner in the pairing handshake's payload. */
  name: string;
  platform: string;
}

export type TunnelOptions = DailyTunnelOptions | PairTunnelOptions;

/** An open, authenticated tunnel. */
export interface Tunnel {
  /** The pairing handshake's `deviceId`; `null` for a daily tunnel. */
  readonly authorizedDeviceId: string | null;
  /** Resolves once the tunnel ended, with the reason; never rejects. */
  readonly closed: Promise<RelayError>;
  send(stream: number, type: number, body?: Uint8Array): void;
  close(): void;
}

/** The Relay's Device endpoint for `relayUrl`'s ws/wss address. */
export function deviceEndpoint(relayUrl: string, runnerId: string): string {
  const url = new URL(relayUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else throw relayError("invalid-link");
  url.pathname = "/v1/device";
  url.search = `?runner=${encodeURIComponent(runnerId)}`;
  url.hash = "";
  return url.toString();
}

function modeByte(mode: TunnelOptions["mode"]): number {
  return mode === "daily" ? MODE_DAILY : MODE_PAIR;
}

function prologueFor(mode: TunnelOptions["mode"], runnerId: string): Uint8Array {
  return concatBytes(
    utf8Encode(TUNNEL_PROLOGUE),
    Uint8Array.of(modeByte(mode)),
    utf8Encode(runnerId),
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(relayError("handshake-failed")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: Error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function asBytes(data: string | Uint8Array): Uint8Array {
  return typeof data === "string" ? utf8Encode(data) : data;
}

function parseJson(bytes: Uint8Array): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(utf8Decode(bytes));
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // Reported as a handshake failure below.
  }
  throw relayError("handshake-failed");
}

/** Dialing, handshaking and the socket's read loop, with the carrier kept outside. */
class TunnelConnectionImpl implements Tunnel {
  readonly closed: Promise<RelayError>;
  authorizedDeviceId: string | null = null;

  private readonly socket: TunnelConnection;
  private readonly handshake: HandshakeState;
  private readonly handlers: TunnelHandlers;
  private readonly pingIntervalMs: number;
  private sendCipher: CipherState | null = null;
  private receiveCipher: CipherState | null = null;
  private writing: Promise<void> = Promise.resolve();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private missedPongs = 0;
  private ended = false;
  private settle!: (error: RelayError) => void;

  constructor(
    socket: TunnelConnection,
    handshake: HandshakeState,
    handlers: TunnelHandlers,
    pingIntervalMs: number,
  ) {
    this.socket = socket;
    this.handshake = handshake;
    this.handlers = handlers;
    this.pingIntervalMs = pingIntervalMs;
    this.closed = new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  static async open(options: TunnelOptions, handlers: TunnelHandlers): Promise<Tunnel> {
    const url = deviceEndpoint(options.relayUrl, options.runnerId);
    const dial = options.connect ?? ((target: string) => connect(target));
    let socket: TunnelConnection;
    try {
      socket = await dial(url);
    } catch (error) {
      throw new RelayError("closed", `Could not reach the Relay: ${(error as Error).message}`);
    }

    try {
      const protocol = options.mode === "daily" ? NOISE_IK : NOISE_IKPSK1;
      const handshake = new HandshakeState({
        protocol,
        role: "initiator",
        prologue: prologueFor(options.mode, options.runnerId),
        staticKey: options.identity,
        remoteStatic: options.runnerKey,
        psk: options.mode === "pair" ? options.psk : undefined,
      });
      const payload =
        options.mode === "daily"
          ? utf8Encode("{}")
          : utf8Encode(JSON.stringify({ name: options.name, platform: options.platform }));
      const first = concatBytes(
        Uint8Array.of(modeByte(options.mode)),
        handshake.writeMessage(payload),
      );
      await socket.write(first);

      const reply = await withTimeout(
        socket.read(),
        options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS,
      );
      if (reply === null) throw errorForCloseCode(socket.closeCode);
      const answer = handshake.readMessage(asBytes(reply));
      const tunnel = new TunnelConnectionImpl(
        socket,
        handshake,
        handlers,
        options.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS,
      );
      tunnel.finishHandshake(options, parseJson(answer));
      tunnel.start();
      return tunnel;
    } catch (error) {
      await socket.close(1000).catch(() => undefined);
      socket.dispose();
      throw error instanceof RelayError ? error : relayError("handshake-failed");
    }
  }

  private finishHandshake(options: TunnelOptions, answer: Record<string, unknown>): void {
    if (options.mode === "daily") {
      if (answer.error === "device-revoked") throw relayError("device-revoked");
      if (answer.ok !== true) throw relayError("handshake-failed");
      return;
    }
    const deviceId = publicId(options.identity.publicKey);
    if (answer.ok !== true || answer.deviceId !== deviceId) throw relayError("handshake-failed");
    this.authorizedDeviceId = deviceId;
  }

  private start(): void {
    const ciphers = this.handshake.split();
    this.sendCipher = ciphers.send;
    this.receiveCipher = ciphers.receive;
    this.pingTimer = setInterval(() => this.ping(), this.pingIntervalMs);
    void this.readLoop();
  }

  send(stream: number, type: number, body: Uint8Array = EMPTY): void {
    if (this.ended) throw relayError("closed");
    if (stream < 0 || stream > 0xffffffff) throw new RangeError(`stream out of range: ${stream}`);
    if (body.length > MAX_FRAME_BODY)
      throw new RangeError(`frame body is ${body.length} bytes, at most ${MAX_FRAME_BODY}`);
    const frame = concatBytes(u32be(stream), Uint8Array.of(type), body);
    this.enqueue(frame);
  }

  private enqueue(plaintext: Uint8Array): void {
    let message: Uint8Array;
    try {
      message = this.sendCipher!.encryptWithAd(EMPTY, plaintext);
    } catch {
      this.fail(new RelayError("closed", "The tunnel's message counter is exhausted."));
      return;
    }
    this.writing = this.writing
      .then(() => this.socket.write(message))
      .catch((error: Error) =>
        this.fail(new RelayError("closed", `The Relay connection failed: ${error.message}`)),
      );
  }

  close(): void {
    if (this.ended) return;
    this.ended = true;
    this.stopPing();
    this.writing
      .then(() => this.socket.close(1000))
      .catch(() => undefined)
      .then(() => this.socket.dispose())
      .then(() => this.settle(errorForCloseCode(1000)));
  }

  private ping(): void {
    if (this.ended) return;
    if (this.missedPongs >= MISSED_PONGS) {
      this.fail(relayError("ping-timeout"));
      return;
    }
    this.send(CONTROL_STREAM, TYPE_CONTROL, utf8Encode('{"type":"ping"}'));
    this.missedPongs += 1;
  }

  private async readLoop(): Promise<void> {
    try {
      for (;;) {
        const data = await this.socket.read();
        if (data === null) {
          this.fail(errorForCloseCode(this.socket.closeCode));
          return;
        }
        this.receive(asBytes(data));
        if (this.ended) return;
      }
    } catch (error) {
      this.fail(
        new RelayError("closed", `The Relay connection failed: ${(error as Error).message}`),
      );
    }
  }

  private receive(message: Uint8Array): void {
    let plaintext: Uint8Array;
    try {
      plaintext = this.receiveCipher!.decryptWithAd(EMPTY, message);
    } catch {
      this.fail(
        new RelayError("protocol", "The Runner sent a message this Device cannot decrypt."),
      );
      return;
    }
    if (plaintext.length < 5) {
      this.fail(new RelayError("protocol", "The Runner sent a frame shorter than its header."));
      return;
    }
    const stream = readU32be(plaintext);
    const type = plaintext[4];
    const body = plaintext.slice(5);
    if (stream === CONTROL_STREAM) {
      if (type !== TYPE_CONTROL) {
        this.fail(new RelayError("protocol", "The control stream carried a non-control frame."));
        return;
      }
      this.control(body);
      return;
    }
    try {
      this.handlers.onFrame(stream, type, body);
    } catch (error) {
      this.fail(new RelayError("closed", `A stream handler failed: ${(error as Error).message}`));
    }
  }

  private control(body: Uint8Array): void {
    let message: Record<string, unknown>;
    try {
      message = parseJson(body);
    } catch {
      this.fail(new RelayError("protocol", "The Runner sent a control frame that is not JSON."));
      return;
    }
    if (message.type === "pong") {
      this.missedPongs = 0;
    } else if (message.type === "ping") {
      this.send(CONTROL_STREAM, TYPE_CONTROL, utf8Encode('{"type":"pong"}'));
    } else if (message.type === "revoked") {
      this.fail(relayError("device-revoked"));
    }
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private fail(error: RelayError): void {
    if (this.ended) return;
    this.ended = true;
    this.stopPing();
    void this.writing
      .then(() => this.socket.close(1000))
      .catch(() => undefined)
      .then(() => this.socket.dispose());
    this.settle(error);
    this.handlers.onClose(error);
  }
}

/** Dials the Relay, runs the selected handshake, and returns the live tunnel. */
export function openTunnel(options: TunnelOptions, handlers: TunnelHandlers): Promise<Tunnel> {
  return TunnelConnectionImpl.open(options, handlers);
}
