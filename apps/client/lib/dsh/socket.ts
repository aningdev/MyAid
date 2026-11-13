import type { ConnectionWebSocket } from "@deepseek-ai/dsh-client-connection/client";
import { connect, type WebSocketConnection } from "websocket";

import { t } from "../i18n";

/** What opens a connection: `websocket.connect`, or a test's stand-in. */
export type SocketConnector = (
  url: string,
  options?: { headers?: Record<string, string> },
) => Promise<WebSocketConnection>;

/**
 * EventTarget-shaped WebSocket for official dsh client `createWebSocket`
 * injection, over NSH's standard `websocket` module: `connect` sends the
 * `Cookie` handed over by `/connect`, and `nsh.json` grants only the loopback
 * dsh origin (the mux, `/connect` and the `/api` calls).
 */
export class AuthenticatedSocket extends EventTarget {
  declare addEventListener: EventTarget["addEventListener"] &
    ConnectionWebSocket["addEventListener"];
  declare removeEventListener: EventTarget["removeEventListener"] &
    ConnectionWebSocket["removeEventListener"];
  readyState = 0;
  private socket?: WebSocketConnection;
  /** The close event comes once: from the read loop, or from a failed handshake. */
  private closed = false;
  private readonly decoder = new TextDecoder();

  constructor(url: string, cookie: string, open: SocketConnector = connect) {
    super();
    open(url, { headers: { Cookie: cookie } }).then(
      (socket) => {
        if (this.readyState !== 0) {
          // Closed while connecting: report it once, as a browser would.
          socket.close().catch(() => undefined);
          socket.dispose();
          this.end();
          return;
        }
        this.socket = socket;
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
        void this.read(socket);
      },
      () => {
        this.readyState = 3;
        this.dispatchEvent(new Event("error"));
        this.end();
      },
    );
  }

  /** Reads until the connection ends; the module allows one outstanding read. */
  private async read(socket: WebSocketConnection): Promise<void> {
    try {
      for (;;) {
        const data = await socket.read();
        if (data === null || this.readyState !== 1) break;
        const text = typeof data === "string" ? data : this.decoder.decode(data);
        this.dispatchEvent(Object.assign(new Event("message"), { data: text }));
      }
    } catch {
      if (this.readyState === 1) this.dispatchEvent(new Event("error"));
    } finally {
      this.socket = undefined;
      socket.dispose();
      this.end();
    }
  }

  /** Ends the socket: one `close` event, `readyState` CLOSED. */
  private end(): void {
    if (this.closed) return;
    this.closed = true;
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  send(data: string) {
    if (this.readyState !== 1 || !this.socket) throw new Error(t("dsh.error.socketClosed"));
    this.socket.write(data).catch(() => {
      if (this.readyState === 1) this.dispatchEvent(new Event("error"));
    });
  }

  close() {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    this.socket?.close().catch(() => undefined);
  }
}
