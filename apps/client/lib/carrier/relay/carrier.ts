// The Device-side Carrier: one Relay tunnel, multiplexed into the `fetch` and
// `createWebSocket` that official dsh `installConnection` injects. Streams are
// numbered here; the tunnel below only moves opaque frames.

import { concatBytes, utf8Decode, utf8Encode } from "./bytes";
import { RelayError, relayError } from "./errors";
import { clearPairing, type Pairing, type StorageLike } from "./pairing";
import {
  openTunnel,
  MAX_FRAME_BODY,
  type Tunnel,
  type TunnelConnector,
  type TunnelHandlers,
} from "./tunnel";

/** A virtual origin: the carrier only keeps the path and query of a request. */
export const RELAY_STREAM_ORIGIN = "https://relay.dsh-bot.invalid/";

const TYPE_HTTP_REQUEST = 1;
const TYPE_HTTP_RESPONSE = 2;
const TYPE_BODY = 3;
const TYPE_END = 4;
const TYPE_WS_OPEN = 5;
const TYPE_WS_ACCEPT = 6;
const TYPE_WS_TEXT = 7;
const TYPE_WS_BINARY = 8;
const TYPE_WS_CLOSE = 9;
const TYPE_RESET = 10;

const CHUNK = 16 * 1024;
const MAX_WS_MESSAGE = 8 * 1024 * 1024;
const CLOSE_NORMAL = 1000;

export interface RelayCarrierOptions {
  pairing: Pairing;
  /** The Device's static key pair; its public id is the device id. */
  identity: { privateKey: Uint8Array; publicKey: Uint8Array };
  storage?: StorageLike;
  /** A test seam for the tunnel's websocket. */
  connect?: TunnelConnector;
  pingIntervalMs?: number;
  /** Called when the Runner revoked this Device; the pairing is already cleared. */
  onRevoked?: () => void;
}

/** The transport official dsh `installConnection` takes. */
export interface RelayCarrier {
  readonly streamBaseUrl: string;
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  createWebSocket(url: string): RelaySocket;
  /** Ends the tunnel and every stream on it. */
  close(): void;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Buffers a response body and hands it to a `ReadableStream` on demand. */
class BodySink {
  readonly stream: ReadableStream<Uint8Array>;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private queue: Uint8Array[] = [];
  private over = false;

  constructor() {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
        this.flush();
      },
      pull: () => this.flush(),
      cancel: () => {
        this.over = true;
        this.queue = [];
      },
    });
  }

  push(chunk: Uint8Array): void {
    if (this.over) return;
    this.queue.push(chunk);
    this.flush();
  }

  finish(): void {
    if (this.over) return;
    this.over = true;
    this.flush();
    this.controller?.close();
  }

  fail(error: Error): void {
    if (this.over) return;
    this.over = true;
    this.queue = [];
    this.controller?.error(error);
  }

  private flush(): void {
    if (!this.controller) return;
    while (this.queue.length > 0) this.controller.enqueue(this.queue.shift()!);
  }
}

interface StreamHandler {
  onFrame(type: number, body: Uint8Array): void;
  fail(error: RelayError): void;
}

function decodeJson(body: Uint8Array): Record<string, unknown> {
  const value: unknown = JSON.parse(utf8Decode(body));
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("expected a JSON object");
  return value as Record<string, unknown>;
}

function headerPairs(value: unknown): [string, string][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (pair): pair is [string, string] =>
      Array.isArray(pair) &&
      pair.length === 2 &&
      typeof pair[0] === "string" &&
      typeof pair[1] === "string",
  );
}

/** Splits text bytes so no fragment ends inside a UTF-8 sequence. */
function splitText(bytes: Uint8Array, limit: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    if (end < bytes.length) {
      while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
    }
    chunks.push(bytes.slice(start, end));
    start = end;
  }
  return chunks;
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error
    ? reason
    : new DOMException("The request was aborted.", "AbortError");
}

/** An EventTarget-shaped socket over one tunnel stream. */
export class RelaySocket extends EventTarget {
  readyState = 0;
  protocol: string | null = null;

  private readonly stream: number;
  private readonly carrier: RelayCarrierImpl;
  private readonly decoder = new TextDecoder();
  private readonly fragments: Uint8Array[] = [];
  private fragmentBytes = 0;
  private fragmentKind: number | null = null;
  private ended = false;

  constructor(carrier: RelayCarrierImpl, stream: number) {
    super();
    this.carrier = carrier;
    this.stream = stream;
  }

  send(data: string | Uint8Array): void {
    if (this.readyState !== 1) throw relayError("closed");
    if (typeof data === "string") {
      const bytes = utf8Encode(data);
      this.sendFragments(TYPE_WS_TEXT, splitText(bytes, MAX_FRAME_BODY - 1));
    } else {
      this.sendFragments(TYPE_WS_BINARY, this.binaryChunks(data));
    }
  }

  close(code = CLOSE_NORMAL, reason = ""): void {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    if (this.readyStateOfStream())
      this.carrier.send(this.stream, TYPE_WS_CLOSE, utf8Encode(JSON.stringify({ code, reason })));
    this.end(code, reason, true);
  }

  /** Called by the carrier when the Runner accepted the stream. */
  accept(protocol: string | null): void {
    this.protocol = protocol;
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }

  receiveText(data: Uint8Array, fin: boolean): void {
    this.receive(TYPE_WS_TEXT, data, fin);
  }

  receiveBinary(data: Uint8Array, fin: boolean): void {
    this.receive(TYPE_WS_BINARY, data, fin);
  }

  remoteClose(code: number, reason: string): void {
    if (this.readyState === 3) return;
    this.carrier.send(
      this.stream,
      TYPE_WS_CLOSE,
      utf8Encode(JSON.stringify({ code: CLOSE_NORMAL, reason: "" })),
    );
    this.end(code, reason, true);
  }

  fail(error: Error): void {
    if (this.ended) return;
    this.readyState = 3;
    this.ended = true;
    this.carrier.finish(this.stream);
    this.dispatchEvent(new Event("error"));
    this.dispatchEvent(
      Object.assign(new Event("close"), { code: 1006, reason: error.message, wasClean: false }),
    );
  }

  end(code: number, reason: string, clean: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.readyState = 3;
    this.carrier.finish(this.stream);
    this.dispatchEvent(Object.assign(new Event("close"), { code, reason, wasClean: clean }));
  }

  private readyStateOfStream(): boolean {
    return !this.ended;
  }

  private sendFragments(type: number, chunks: Uint8Array[]): void {
    if (chunks.length === 0) {
      this.carrier.send(this.stream, type, Uint8Array.of(1));
      return;
    }
    chunks.forEach((chunk, index) => {
      const fin = index === chunks.length - 1 ? 1 : 0;
      this.carrier.send(this.stream, type, concatBytes(Uint8Array.of(fin), chunk));
    });
  }

  private binaryChunks(bytes: Uint8Array): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    for (let at = 0; at < bytes.length; at += CHUNK) chunks.push(bytes.slice(at, at + CHUNK));
    return chunks;
  }

  private receive(kind: number, data: Uint8Array, fin: boolean): void {
    if (this.ended) return;
    if (this.fragmentKind !== null && this.fragmentKind !== kind) {
      this.carrier.send(this.stream, TYPE_RESET, utf8Encode(JSON.stringify({ code: "protocol" })));
      this.fail(relayError("protocol"));
      return;
    }
    this.fragmentKind = kind;
    this.fragmentBytes += data.length;
    if (this.fragmentBytes > MAX_WS_MESSAGE) {
      this.carrier.send(
        this.stream,
        TYPE_RESET,
        utf8Encode(JSON.stringify({ code: "overloaded" })),
      );
      this.fail(relayError("overloaded"));
      return;
    }
    if (data.length > 0) this.fragments.push(data);
    if (!fin) return;

    const whole = concatBytes(...this.fragments);
    this.fragments.length = 0;
    this.fragmentBytes = 0;
    this.fragmentKind = null;
    const message: unknown = kind === TYPE_WS_TEXT ? this.decoder.decode(whole) : whole;
    this.dispatchEvent(Object.assign(new Event("message"), { data: message }));
  }
}

class RelayCarrierImpl implements RelayCarrier {
  readonly streamBaseUrl: string;

  private readonly options: RelayCarrierOptions;
  private readonly streams = new Map<number, StreamHandler>();
  private nextStream = 1;
  private tunnel: Tunnel | null = null;
  private connecting: Promise<Tunnel> | null = null;
  private closed = false;

  constructor(options: RelayCarrierOptions, streamBaseUrl = RELAY_STREAM_ORIGIN) {
    this.options = options;
    this.streamBaseUrl = streamBaseUrl;
  }

  async fetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const url = new URL(String(input), this.streamBaseUrl);
    const path = `${url.pathname}${url.search}`;
    const { bytes, contentType } = await this.bodyOf(init);
    const tunnel = await this.ensureTunnel();
    const signal = init.signal ?? null;
    if (signal?.aborted) throw abortError(signal);

    const stream = this.allocate();
    const head = deferred<{ status: number; headers: [string, string][] }>();
    const body = new BodySink();
    this.streams.set(stream, {
      onFrame: (type, payload) => {
        if (type === TYPE_HTTP_RESPONSE) {
          const message = decodeJson(payload);
          head.resolve({ status: Number(message.status), headers: headerPairs(message.headers) });
        } else if (type === TYPE_BODY) {
          body.push(payload);
        } else if (type === TYPE_END) {
          body.finish();
          this.finish(stream);
        } else if (type === TYPE_RESET) {
          const error = this.resetError(payload);
          head.reject(error);
          body.fail(error);
          this.finish(stream);
        }
      },
      fail: (error) => {
        head.reject(error);
        body.fail(error);
        this.finish(stream);
      },
    });

    const onAbort = () => {
      const error = abortError(signal!);
      head.reject(error);
      body.fail(error);
      this.finish(stream);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const headers: [string, string][] = [];
    new Headers(init.headers).forEach((value, name) => headers.push([name, value]));
    if (contentType && !headers.some(([name]) => name === "content-type"))
      headers.push(["content-type", contentType]);
    const request = utf8Encode(JSON.stringify({ method: init.method ?? "GET", path, headers }));
    this.send(stream, TYPE_HTTP_REQUEST, request);
    for (let at = 0; at < bytes.length; at += CHUNK)
      this.send(stream, TYPE_BODY, bytes.slice(at, at + CHUNK));
    this.send(stream, TYPE_END);

    const response = await head.promise;
    signal?.removeEventListener("abort", onAbort);
    if (response.status === 204 || response.status === 205) body.finish();
    const empty = response.status === 204 || response.status === 205;
    return new Response(empty ? null : body.stream, {
      status: response.status,
      headers: response.headers,
    });
  }

  createWebSocket(url: string): RelaySocket {
    const parsed = new URL(url, this.streamBaseUrl);
    const path = `${parsed.pathname}${parsed.search}`;
    const stream = this.allocate();
    const socket = new RelaySocket(this, stream);
    this.streams.set(stream, {
      onFrame: (type, body) => {
        if (type === TYPE_WS_ACCEPT) {
          const message = decodeJson(body);
          const protocol = typeof message.protocol === "string" ? message.protocol : null;
          socket.accept(protocol);
        } else if (type === TYPE_WS_TEXT) {
          if (body.length === 0) return socket.fail(relayError("protocol"));
          socket.receiveText(body.slice(1), body[0] === 1);
        } else if (type === TYPE_WS_BINARY) {
          if (body.length === 0) return socket.fail(relayError("protocol"));
          socket.receiveBinary(body.slice(1), body[0] === 1);
        } else if (type === TYPE_WS_CLOSE) {
          const message = decodeJson(body);
          socket.remoteClose(Number(message.code ?? CLOSE_NORMAL), String(message.reason ?? ""));
        } else if (type === TYPE_RESET) {
          socket.fail(this.resetError(body));
        }
      },
      fail: (error) => socket.fail(error),
    });
    void this.ensureTunnel().then(
      () => this.send(stream, TYPE_WS_OPEN, utf8Encode(JSON.stringify({ path, protocols: [] }))),
      (error: Error) => socket.fail(error instanceof RelayError ? error : relayError("closed")),
    );
    return socket;
  }

  close(): void {
    this.closed = true;
    this.tunnel?.close();
    this.tunnel = null;
    this.connecting = null;
    for (const handler of [...this.streams.values()]) handler.fail(relayError("closed"));
  }

  /** Sends one tunnel frame; the tunnel owns encryption and write ordering. */
  send(stream: number, type: number, body: Uint8Array = new Uint8Array(0)): void {
    if (this.closed || !this.tunnel) throw relayError("closed");
    this.tunnel.send(stream, type, body);
  }

  /** Drops a finished stream so late frames are ignored. */
  finish(stream: number): void {
    this.streams.delete(stream);
  }

  private allocate(): number {
    const stream = this.nextStream;
    this.nextStream += 2;
    if (this.nextStream > 0xffffffff) throw relayError("closed");
    return stream;
  }

  private async bodyOf(
    init: RequestInit,
  ): Promise<{ bytes: Uint8Array; contentType: string | null }> {
    if (init.body === undefined || init.body === null)
      return { bytes: new Uint8Array(0), contentType: null };
    const body = init.body as BodyInit;
    if (typeof body === "string") return { bytes: utf8Encode(body), contentType: null };
    if (body instanceof Uint8Array) return { bytes: body, contentType: null };
    if (body instanceof ArrayBuffer) return { bytes: new Uint8Array(body), contentType: null };
    if (ArrayBuffer.isView(body))
      return {
        bytes: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
        contentType: null,
      };
    const response = new Response(body);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type"),
    };
  }

  private async ensureTunnel(): Promise<Tunnel> {
    if (this.closed) throw relayError("closed");
    if (this.tunnel) return this.tunnel;
    if (!this.connecting) {
      const { pairing, identity } = this.options;
      this.connecting = openTunnel(
        {
          mode: "daily",
          relayUrl: pairing.relayUrl,
          runnerId: pairing.runnerId,
          runnerKey: pairing.runnerKey,
          identity,
          pingIntervalMs: this.options.pingIntervalMs,
          connect: this.options.connect,
        },
        this.handlers(),
      ).then(
        (tunnel) => {
          this.tunnel = tunnel;
          this.connecting = null;
          void tunnel.closed.then((error) => this.tunnelEnded(tunnel, error));
          return tunnel;
        },
        (error: Error) => {
          this.connecting = null;
          throw error;
        },
      );
    }
    return this.connecting;
  }

  private handlers(): TunnelHandlers {
    return {
      onFrame: (stream, type, body) => {
        const handler = this.streams.get(stream);
        if (!handler) return;
        try {
          handler.onFrame(type, body);
        } catch (error) {
          this.streams.delete(stream);
          handler.fail(error instanceof RelayError ? error : relayError("protocol"));
        }
      },
      onClose: (error) => {
        for (const handler of [...this.streams.values()]) handler.fail(error);
      },
    };
  }

  private tunnelEnded(tunnel: Tunnel, error: RelayError): void {
    if (this.tunnel === tunnel) this.tunnel = null;
    if (error.code !== "device-revoked") return;
    void clearPairing(this.options.storage);
    this.options.onRevoked?.();
  }

  private resetError(body: Uint8Array): RelayError {
    try {
      const message = decodeJson(body);
      const code = message.code;
      if (
        code === "forbidden" ||
        code === "protocol" ||
        code === "overloaded" ||
        code === "unavailable"
      ) {
        return relayError(code);
      }
    } catch {
      // Falls through to the generic protocol error.
    }
    return relayError("protocol");
  }
}

/** Builds the Carrier over an existing pairing and Device identity. */
export function createRelayCarrier(options: RelayCarrierOptions): RelayCarrier {
  return new RelayCarrierImpl(options);
}
