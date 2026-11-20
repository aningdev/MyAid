// The dsh web behind the Runner's Bridge, reduced to the two wire shapes a
// Client needs to become ready: the unary request/response envelope and the
// `$events` stream whose first item is `ready`. It plugs into `FakeBridge`'s
// `respondHttp`/`respondText` hooks, so a test can drive the official
// `Connection` over a Relay Carrier without a Host or a dsh process.

import type { BridgeRequest, BridgeResponse, BridgeSocket } from "./fake-bridge";

/** One unary call the fake dsh answered. */
export interface FakeDshCall {
  method: string;
  payload: unknown;
}

export interface FakeDsh {
  respondHttp(request: BridgeRequest): BridgeResponse | undefined;
  respondText(socket: BridgeSocket, text: string): string | undefined;
  /** Unary calls, in the order the Device sent them. */
  readonly calls: FakeDshCall[];
}

interface Envelope {
  type: string;
  rpcId?: string;
  method?: string;
  payload?: unknown;
  streamId?: number;
  endpoint?: string;
}

function parse(text: string): Envelope | undefined {
  try {
    const value: unknown = JSON.parse(text);
    return value !== null && typeof value === "object" ? (value as Envelope) : undefined;
  } catch {
    return undefined;
  }
}

/** The answers the Client's models read on install. */
const values: Record<string, unknown> = {
  "agentPresets/list": { presets: [{ id: "default", name: "Default", isDefault: true }] },
  "session/list": { items: [] },
};

export function fakeDsh(): FakeDsh {
  const calls: FakeDshCall[] = [];

  return {
    calls,
    respondHttp(request) {
      if (request.method !== "POST") return undefined;
      const message = parse(new TextDecoder().decode(request.body));
      if (!message || message.type !== "client-request" || !message.rpcId) return undefined;
      const method = String(message.method ?? "");
      calls.push({ method, payload: message.payload });
      const value = values[method] ?? {};
      return {
        status: 200,
        body: JSON.stringify({
          type: "server-response",
          rpcId: message.rpcId,
          result: { ok: true, value },
        }),
      };
    },
    respondText(_socket, text) {
      const message = parse(text);
      if (!message || message.type !== "open" || message.streamId === undefined) return undefined;
      if (message.endpoint === "$events") {
        return JSON.stringify({
          type: "item",
          streamId: message.streamId,
          value: { type: "ready", clientId: "fake-client", host: { home: "/tmp" } },
        });
      }
      return JSON.stringify({ type: "end", streamId: message.streamId });
    },
  };
}
