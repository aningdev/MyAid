// A loopback stand-in for dsh web, just big enough for the Bridge: the login
// exchange, one unary `POST /api/echo`, a body that never ends (`/api/slow`)
// and the `/api/remote.mux` WebSocket. The Host reaches it through a fake
// `dsh` executable that prints this server's login URL.

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { WebSocketServer } from "ws";

export interface FakeDshOptions {
  /** What `/api/echo` puts in its response body. */
  httpReply: string;
  /** What the mux answers to every text message. */
  muxReply: string;
}

export interface FakeDsh {
  readonly port: number;
  readonly loginUrl: string;
  /** Request bodies `/api/echo` received. */
  readonly httpBodies: string[];
  /** Text messages the mux received. */
  readonly muxMessages: string[];
  /** Resolves when a client left `/api/slow` before its body ended. */
  readonly slowAbandoned: Promise<void>;
  /** Resolves when a mux socket closed. */
  readonly muxClosed: Promise<void>;
  stop(): Promise<void>;
}

const LOGIN_TOKEN = "e2e-login";

function hasCookie(request: IncomingMessage, session: string): boolean {
  return (request.headers.cookie ?? "").split("; ").includes(`session=${session}`);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startFakeDsh(options: FakeDshOptions): Promise<FakeDsh> {
  const session = randomBytes(12).toString("hex");
  const httpBodies: string[] = [];
  const muxMessages: string[] = [];
  let abandoned!: () => void;
  const slowAbandoned = new Promise<void>((resolve) => (abandoned = resolve));
  let muxEnded!: () => void;
  const muxClosed = new Promise<void>((resolve) => (muxEnded = resolve));

  const login = (request: IncomingMessage, response: ServerResponse): void => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.searchParams.get("token") !== LOGIN_TOKEN) {
      response.writeHead(403).end();
      return;
    }
    response.writeHead(303, {
      "set-cookie": `session=${session}; Path=/; HttpOnly`,
      location: "/",
    });
    response.end();
  };

  const http: Server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (request.method === "GET" && (path === "/" || path === "/connect"))
      return login(request, response);
    if (request.method !== "POST" || !hasCookie(request, session)) {
      response.writeHead(401).end();
      return;
    }
    if (path === "/api/echo") {
      httpBodies.push(await readBody(request));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ reply: options.httpReply }));
      return;
    }
    if (path === "/api/slow") {
      await readBody(request);
      response.writeHead(200, { "content-type": "text/plain" });
      response.write("tick\n");
      response.on("close", () => {
        if (!response.writableEnded) abandoned();
      });
      return;
    }
    response.writeHead(404).end();
  });

  const sockets = new WebSocketServer({ noServer: true });
  http.on("upgrade", (request, socket, head) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path !== "/api/remote.mux" || !hasCookie(request, session)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (ws) => {
      ws.on("message", (data: Buffer) => {
        muxMessages.push(data.toString("utf8"));
        ws.send(options.muxReply);
      });
      ws.on("close", muxEnded);
    });
  });

  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as AddressInfo).port;
  return {
    port,
    loginUrl: `http://127.0.0.1:${port}/?token=${LOGIN_TOKEN}`,
    httpBodies,
    muxMessages,
    slowAbandoned,
    muxClosed,
    async stop() {
      for (const client of sockets.clients) client.terminate();
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
