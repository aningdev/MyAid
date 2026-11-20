// Stand-in for the NSH `websocket` module: the same `connect` the tunnel calls,
// over Node's own WebSocket, so the Device speaks to a real Relay on loopback.

export interface WebSocketConnection {
  read(): Promise<string | Uint8Array | null>;
  write(data: string | Uint8Array): Promise<void>;
  close(code?: number | null, reason?: string | null): Promise<void>;
  readonly closeCode: number | null;
  readonly closeReason: string | null;
  dispose(): void;
}

export function connect(url: string): Promise<WebSocketConnection> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    const queue: (string | Uint8Array | null)[] = [];
    const waiters: ((value: string | Uint8Array | null) => void)[] = [];
    let closeCode: number | null = null;
    let closeReason: string | null = null;
    const push = (value: string | Uint8Array | null): void => {
      const waiter = waiters.shift();
      if (waiter) waiter(value);
      else queue.push(value);
    };
    const connection: WebSocketConnection = {
      read: () => {
        const next = queue.shift();
        if (next !== undefined) return Promise.resolve(next);
        if (closeCode !== null) return Promise.resolve(null);
        return new Promise((done) => waiters.push(done));
      },
      write: async (data) => socket.send(typeof data === "string" ? data : new Uint8Array(data)),
      close: async (code, reason) => socket.close(code ?? 1000, reason ?? ""),
      get closeCode() {
        return closeCode;
      },
      get closeReason() {
        return closeReason;
      },
      dispose: () => undefined,
    };
    socket.onopen = () => resolve(connection);
    socket.onerror = () => reject(new Error("websocket error"));
    socket.onmessage = (event) =>
      push(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
    socket.onclose = (event) => {
      closeCode = event.code;
      closeReason = event.reason;
      push(null);
      while (waiters.length > 0) waiters.shift()?.(null);
    };
  });
}
