// The Runner's half of a tunnel in memory: it reads the carrier's contract
// frames and answers like the Bridge does, so carrier tests need no sockets.

import { concatBytes, publicId, utf8Decode, utf8Encode } from "../bytes";
import type { KeyPair } from "../noise";
import { FakeRelay, type FakeFrame } from "./fake-relay";

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

export interface BridgeRequest {
  stream: number;
  method: string;
  path: string;
  headers: [string, string][];
  body: Uint8Array;
  /** How many BODY frames the Device sent. */
  bodyFrames: number;
}

export interface BridgeSocket {
  stream: number;
  path: string;
  protocols: string[];
  accepted: string | null;
  text: string;
  binary: Uint8Array;
  close: { code: number; reason: string } | null;
}

export interface BridgeResponse {
  status: number;
  headers?: [string, string][];
  body: string;
  /** Split the body into this many BODY frames. */
  chunks?: number;
  /** Send the head and first chunk, then wait for `finish`. */
  hold?: boolean;
}

export interface FakeBridgeOptions {
  mode: "daily" | "pair";
  runner: KeyPair;
  runnerId: string;
  identity: KeyPair;
  psk?: Uint8Array;
  revoked?: boolean;
  answerPings?: boolean;
  /** Answer HTTP requests; off to leave requests in flight. */
  answerHttp?: boolean;
  /** Split each response body into this many BODY frames. */
  responseChunks?: number;
  /** Split WS echoes into this many fragments. */
  wsFragments?: number;
  /** Close instead of answering the handshake. */
  rejectCloseCode?: number;
  /** Answer an HTTP request itself; `undefined` falls back to the echo. */
  respondHttp?: (request: BridgeRequest) => BridgeResponse | undefined;
  /** Answer a whole WS text message; `undefined` falls back to the echo. */
  respondText?: (socket: BridgeSocket, text: string) => string | undefined;
}

/** A scripted Runner: HTTP echo, WebSocket echo, and every recorded frame. */
export class FakeBridge {
  readonly relay: FakeRelay;
  readonly requests: BridgeRequest[] = [];
  readonly sockets = new Map<number, BridgeSocket>();
  readonly resets: { stream: number; code: unknown }[] = [];

  private readonly options: FakeBridgeOptions;
  private readonly building = new Map<number, BridgeRequest>();
  private readonly textParts = new Map<number, Uint8Array[]>();
  private readonly binaryParts = new Map<number, Uint8Array[]>();

  constructor(options: FakeBridgeOptions) {
    this.options = options;
    this.relay = new FakeRelay({
      mode: options.mode,
      runner: options.runner,
      runnerId: options.runnerId,
      deviceId: publicId(options.identity.publicKey),
      psk: options.psk,
      revoked: options.revoked,
      answerPings: options.answerPings,
      rejectCloseCode: options.rejectCloseCode,
      onFrame: (frame) => this.frame(frame),
    });
  }

  get connector() {
    return this.relay.connector;
  }

  /** Ends a response that `hold` left open. */
  finish(stream: number): void {
    this.relay.sendFrame(stream, TYPE_END);
  }

  /** Sends a control frame on stream 0. */
  control(type: "revoked" | "ping" | "pong"): void {
    this.relay.sendFrame(0, 11, utf8Encode(JSON.stringify({ type })));
  }

  /** Sends `text` to a websocket stream in `fragments` pieces. */
  text(stream: number, text: string, fragments = 1): void {
    const points = Array.from(text);
    const size = Math.max(1, Math.ceil(points.length / fragments));
    for (let at = 0; at < points.length; at += size) {
      const part = utf8Encode(points.slice(at, at + size).join(""));
      const fin = at + size >= points.length ? 1 : 0;
      this.relay.sendFrame(stream, TYPE_WS_TEXT, concatBytes(Uint8Array.of(fin), part));
    }
  }

  binary(stream: number, data: Uint8Array, fragments = 1): void {
    const size = Math.max(1, Math.ceil(data.length / fragments));
    for (let at = 0; at < data.length; at += size) {
      const fin = at + size >= data.length ? 1 : 0;
      this.relay.sendFrame(
        stream,
        TYPE_WS_BINARY,
        concatBytes(Uint8Array.of(fin), data.slice(at, at + size)),
      );
    }
  }

  closeSocket(stream: number, code = 1000, reason = ""): void {
    this.relay.sendFrame(stream, TYPE_WS_CLOSE, utf8Encode(JSON.stringify({ code, reason })));
  }

  private frame(frame: FakeFrame): void {
    if (frame.stream === 0) return;
    switch (frame.type) {
      case TYPE_HTTP_REQUEST:
        this.startRequest(frame);
        break;
      case TYPE_BODY: {
        const request = this.building.get(frame.stream);
        if (!request) return;
        request.body = concatBytes(request.body, frame.body);
        request.bodyFrames += 1;
        break;
      }
      case TYPE_END:
        this.endRequest(frame.stream);
        break;
      case TYPE_WS_OPEN:
        this.openSocket(frame);
        break;
      case TYPE_WS_TEXT:
        this.textFrame(frame);
        break;
      case TYPE_WS_BINARY:
        this.binaryFrame(frame);
        break;
      case TYPE_WS_CLOSE: {
        const socket = this.sockets.get(frame.stream);
        if (socket)
          socket.close = JSON.parse(utf8Decode(frame.body)) as { code: number; reason: string };
        break;
      }
      case TYPE_RESET:
        this.resets.push({ stream: frame.stream, code: JSON.parse(utf8Decode(frame.body)) });
        break;
    }
  }

  private startRequest(frame: FakeFrame): void {
    const head = JSON.parse(utf8Decode(frame.body)) as {
      method: string;
      path: string;
      headers: [string, string][];
    };
    this.building.set(frame.stream, {
      stream: frame.stream,
      method: head.method,
      path: head.path,
      headers: head.headers,
      body: new Uint8Array(0),
      bodyFrames: 0,
    });
  }

  private endRequest(stream: number): void {
    const request = this.building.get(stream);
    if (!request) return;
    this.building.delete(stream);
    this.requests.push(request);
    if (this.options.answerHttp === false) return;

    const answer = this.options.respondHttp?.(request);
    if (answer) {
      this.respond(stream, answer);
      return;
    }

    const response = utf8Encode(
      JSON.stringify({
        method: request.method,
        path: request.path,
        body: utf8Decode(request.body),
      }),
    );
    this.relay.sendFrame(
      stream,
      TYPE_HTTP_RESPONSE,
      utf8Encode(JSON.stringify({ status: 200, headers: [["content-type", "application/json"]] })),
    );
    const chunks = this.options.responseChunks ?? 2;
    const size = Math.max(1, Math.ceil(response.length / chunks));
    for (let at = 0; at < response.length; at += size) {
      this.relay.sendFrame(stream, TYPE_BODY, response.slice(at, at + size));
    }
    this.relay.sendFrame(stream, TYPE_END);
  }

  private respond(stream: number, answer: BridgeResponse): void {
    const head = utf8Encode(
      JSON.stringify({
        status: answer.status,
        headers: answer.headers ?? [["content-type", "application/json"]],
      }),
    );
    this.relay.sendFrame(stream, TYPE_HTTP_RESPONSE, head);
    const body = utf8Encode(answer.body);
    const chunks = answer.chunks ?? this.options.responseChunks ?? 1;
    const size = Math.max(1, Math.ceil(body.length / chunks));
    const end = answer.hold ? body.slice(0, size).length : body.length;
    for (let at = 0; at < end; at += size) {
      this.relay.sendFrame(stream, TYPE_BODY, body.slice(at, at + size));
    }
    if (answer.hold) return;
    this.relay.sendFrame(stream, TYPE_END);
  }

  private openSocket(frame: FakeFrame): void {
    const head = JSON.parse(utf8Decode(frame.body)) as { path: string; protocols?: string[] };
    const protocols = head.protocols ?? [];
    const socket: BridgeSocket = {
      stream: frame.stream,
      path: head.path,
      protocols,
      accepted: protocols[0] ?? null,
      text: "",
      binary: new Uint8Array(0),
      close: null,
    };
    this.sockets.set(frame.stream, socket);
    this.relay.sendFrame(
      frame.stream,
      TYPE_WS_ACCEPT,
      utf8Encode(JSON.stringify({ protocol: socket.accepted })),
    );
  }

  private textFrame(frame: FakeFrame): void {
    if (frame.body.length === 0) return;
    const fin = frame.body[0] === 1;
    const parts = this.textParts.get(frame.stream) ?? [];
    parts.push(frame.body.slice(1));
    this.textParts.set(frame.stream, parts);
    if (!fin) return;
    this.textParts.delete(frame.stream);
    const text = utf8Decode(concatBytes(...parts));
    const socket = this.sockets.get(frame.stream);
    if (socket) socket.text += text;
    const answer = socket ? this.options.respondText?.(socket, text) : undefined;
    if (answer !== undefined) {
      this.text(frame.stream, answer, this.options.wsFragments ?? 1);
      return;
    }
    this.text(frame.stream, text, this.options.wsFragments ?? 1);
  }

  private binaryFrame(frame: FakeFrame): void {
    if (frame.body.length === 0) return;
    const fin = frame.body[0] === 1;
    const parts = this.binaryParts.get(frame.stream) ?? [];
    parts.push(frame.body.slice(1));
    this.binaryParts.set(frame.stream, parts);
    if (!fin) return;
    this.binaryParts.delete(frame.stream);
    const data = concatBytes(...parts);
    const socket = this.sockets.get(frame.stream);
    if (socket) socket.binary = concatBytes(socket.binary, data);
    this.binary(frame.stream, data, this.options.wsFragments ?? 1);
  }
}
