/**
 * `AuthenticatedSocket` over NSH's standard `websocket` module: the dsh client
 * sees a standard EventTarget, the handshake carries the Cookie, and the
 * capability rules in `nsh.json` decide which URLs may open at all.
 */
import { expect, test } from "nsh/test";
import type { WebSocketConnection } from "websocket";
import { connect } from "websocket";

import { AuthenticatedSocket } from "./socket";

const MUX = "ws://127.0.0.1:1/api/remote.mux";

/** A connection the test drives: reads wait for what it pushes. */
class Fake {
  written: string[] = [];
  closes = 0;
  disposed = false;
  private queue: (string | Uint8Array | null)[] = [];
  private failures: string[] = [];
  private waiting: {
    resolve: (value: string | Uint8Array | null) => void;
    reject: (error: Error) => void;
  }[] = [];

  readonly connection = this as unknown as WebSocketConnection;

  read(): Promise<string | Uint8Array | null> {
    const failure = this.failures.shift();
    if (failure !== undefined) return Promise.reject(new Error(failure));
    if (this.queue.length > 0)
      return Promise.resolve(this.queue.shift() as string | Uint8Array | null);
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }

  write(data: string): Promise<void> {
    this.written.push(data);
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closes += 1;
    this.push(null);
    return Promise.resolve();
  }

  dispose(): void {
    this.disposed = true;
  }

  push(value: string | Uint8Array | null): void {
    const waiting = this.waiting.shift();
    if (waiting) waiting.resolve(value);
    else this.queue.push(value);
  }

  fail(error: string): void {
    const waiting = this.waiting.shift();
    if (waiting) waiting.reject(new Error(error));
    else this.failures.push(error);
  }
}

/** The events a socket reports, up to its close. */
function record(socket: AuthenticatedSocket): { events: string[]; closed: Promise<void> } {
  const events: string[] = [];
  const closed = new Promise<void>((resolve) =>
    socket.addEventListener("close", () => {
      events.push("close");
      resolve();
    }),
  );
  socket.addEventListener("open", () => events.push("open"));
  socket.addEventListener("error", () => events.push("error"));
  socket.addEventListener("message", (event: Event) =>
    events.push(`message:${(event as Event & { data: string }).data}`),
  );
  return { events, closed };
}

function opened(socket: AuthenticatedSocket): Promise<void> {
  return new Promise((resolve) => socket.addEventListener("open", () => resolve()));
}

test("the handshake carries the Cookie and the socket opens, reads and closes", async () => {
  const fake = new Fake();
  let url = "";
  let cookie = "";
  const socket = new AuthenticatedSocket(MUX, "dsh=1", async (target, options) => {
    url = target;
    cookie = options?.headers?.Cookie ?? "";
    return fake.connection;
  });
  const { events, closed } = record(socket);
  await opened(socket);

  fake.push("one");
  fake.push("two");
  fake.push(null);
  await closed;

  expect(url).toBe(MUX);
  expect(cookie).toBe("dsh=1");
  expect(events).toEqual(["open", "message:one", "message:two", "close"]);
  expect(socket.readyState).toBe(3);
  expect(fake.disposed).toBe(true);
});

test("a failed handshake reports error then close", async () => {
  const socket = new AuthenticatedSocket(MUX, "dsh=1", async () => {
    throw new Error("handshake refused");
  });
  const { events, closed } = record(socket);
  await closed;

  expect(events).toEqual(["error", "close"]);
  expect(socket.readyState).toBe(3);
});

test("a read failure reports error then close", async () => {
  const fake = new Fake();
  const socket = new AuthenticatedSocket(MUX, "dsh=1", async () => fake.connection);
  const { events, closed } = record(socket);
  await opened(socket);

  fake.fail("connection reset");
  await closed;

  expect(events).toEqual(["open", "error", "close"]);
  expect(socket.readyState).toBe(3);
});

test("closing while connecting still reports close once", async () => {
  const fake = new Fake();
  const socket = new AuthenticatedSocket(MUX, "dsh=1", async () => fake.connection);
  const { events, closed } = record(socket);

  socket.close();
  expect(socket.readyState).toBe(2);
  await closed;

  expect(events).toEqual(["close"]);
  expect(socket.readyState).toBe(3);
  expect(fake.disposed).toBe(true);
});

test("send writes, close ends the connection, and neither works after it", async () => {
  const fake = new Fake();
  const socket = new AuthenticatedSocket(MUX, "dsh=1", async () => fake.connection);
  const { closed } = record(socket);
  await opened(socket);

  socket.send("hello");
  await Promise.resolve();
  expect(fake.written).toEqual(["hello"]);

  socket.close();
  expect(socket.readyState).toBe(2);
  expect(fake.closes).toBe(1);
  await closed;
  expect(socket.readyState).toBe(3);
  expect(() => socket.send("after")).toThrow("Socket is not open");
});

test("nsh.json grants only the loopback dsh endpoints", async () => {
  await expect(connect("ws://example.com/socket")).rejects.toMatchObject({
    code: "ERR_ACCESS_DENIED",
  });
  await expect(connect(MUX.replace("/api/remote.mux", "/api/other"))).rejects.toMatchObject({
    code: "ERR_ACCESS_DENIED",
  });
  await expect(fetch("http://127.0.0.1:1/other")).rejects.toMatchObject({
    code: "ERR_ACCESS_DENIED",
  });
  // The granted mux URL is not refused by the capability, only by the connection.
  await expect(connect(MUX)).rejects.not.toMatchObject({ code: "ERR_ACCESS_DENIED" });
});
