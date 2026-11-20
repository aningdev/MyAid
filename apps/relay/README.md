# dsh-bot-relay

English | [中文](README.zh.md)

Public zero-knowledge Relay. It meets Devices for Pairing and forwards the tunnel's ciphertext frames without decrypting them: it knows a channel number, a length and opaque bytes, never a key or a pairing secret.

It is not a Background Service: no OS registration on any Device, no data root, and no `DSH_BOT_HOME`. It does not hold Owner credentials or replace the Host's Bridge. It keeps only in-memory state: which runner ids are registered right now and which channels are live.

Constraints: [AGENTS.md](AGENTS.md). Read [ARCHITECTURE](../../docs/ARCHITECTURE.md), [0003](../../docs/decisions/0003-every-device-reaches-the-runner-through-a-zero-knowledge-relay.md), [0006](../../docs/decisions/0006-host-is-the-only-background-service.md), and the wire contract in [relay-tunnel](../../docs/architecture/relay-tunnel.md).

## Endpoints

| Endpoint                                 | Purpose                                                     |
| ---------------------------------------- | ----------------------------------------------------------- |
| `GET /`                                  | `dsh-bot-relay`, for a reachability probe                   |
| `GET /v1/health`                         | service, version, `protocol` (tunnel protocol, currently 1) |
| `GET /v1/runner` (WebSocket)             | the one long-lived Bridge link                              |
| `GET /v1/device?runner=<id>` (WebSocket) | one Device connection, one channel on that Bridge link      |

### Runner registration

The Relay sends a text frame `{"type":"challenge","nonce":"<32 random bytes, base64url>"}`, reads `{"type":"hello","protocol":1,"key":"<Ed25519 public key>","sig":"<signature>"}` within 10 seconds, and verifies `sig` over `dsh-bot-relay/1 runner\n` followed by the nonce bytes. Success answers `{"type":"ready","runner":"<id>"}`, where the id is the first 20 bytes of SHA-256 over the public key in lowercase unpadded base32; anything else closes with `4004`.

One runner id has one link. A newer registration closes the older link with `4002`. After `ready` the link carries binary frames only.

### Frames

| Link           | One WebSocket binary message          | Notes                                                                               |
| -------------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| Bridge ↔ Relay | `[u32 channel][u8 type][payload]`, BE | `1 OPEN` (Relay → Bridge, empty) · `2 DATA` · `3 CLOSE` (payload is the `u16` code) |
| Device ↔ Relay | the payload alone                     | the Relay adds or strips the channel header and forwards it unchanged               |

The Relay allocates the channel number; it is unique within one Runner link only.

### Close codes and limits

| Code | Name             | When                                                                                                                                              |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4001 | runner-offline   | the Device's runner id has no link, or the link ended                                                                                             |
| 4002 | replaced         | the same runner registered a newer link                                                                                                           |
| 4003 | overloaded       | one direction queued more than 1 MiB, or one message exceeded 65 600 bytes (channel header included, so a Device message is at most 65 595 bytes) |
| 4004 | bad-auth         | registration failed: bad `hello`, protocol or signature                                                                                           |
| 4005 | too-many         | the runner already has 64 channels, or the source IP exceeded its rate                                                                            |
| 4006 | idle             | the Device sent no first message within 10 seconds                                                                                                |
| 4010 | pairing-rejected | sent by the Bridge: the pairing handshake was refused                                                                                             |
| 4011 | handshake-failed | sent by the Bridge: unknown mode byte, or its first message failed                                                                                |

A `CLOSE` frame from the Bridge closes the Device socket with the same code, including `1000`. A code the WebSocket protocol cannot carry (anything but `1000` and `3000`–`4999`) becomes `1011` and is logged. The Relay pings both links every 20 seconds. When a Runner link ends, all of its channels close with `4001`.

Every number above lives in [`src/limits.rs`](src/limits.rs) and the codes in [`src/frame.rs`](src/frame.rs).

## Commands

```sh
cargo run -p dsh-bot-relay -- serve [--bind ADDR] [--port PORT] [--ready-stdout]
cargo check -p dsh-bot-relay
cargo test -p dsh-bot-relay
cargo test -p dsh-bot-relay --features frame-tap
```

`--bind` is an IP address, default `127.0.0.1`. `--port` defaults to `8787`. Log level is `RUST_LOG`.

`--ready-stdout` prints `{"event":"ready","port":<port>}` once it listens, for scripts and tests.

`--frame-tap PATH` appends every relayed binary frame as one JSON line — `{"seq":n,"link":"bridge"|"device","dir":"in"|"out","bytes":"<base64url>"}` — which is how the end-to-end test proves the Relay only ever sees ciphertext. The flag exists only in builds with the `frame-tap` feature, so a release build cannot record frames at all; the second `cargo test` line above turns it on for the test that reads the file back.

## Known limitations

- It does not host the web Client. A browser reaches a Runner through its own transport, not this process.
- All state is in memory: a restart drops registrations and channels, and Devices reconnect.
- No persistence, no metrics endpoint, no per-owner accounting, no TLS termination of its own — deploy it behind a reverse proxy when it is public.
- The connection rate limit is per source IP in memory, so behind a proxy it needs the proxy's real client address to be meaningful.
