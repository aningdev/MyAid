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
| 4005 | too-many         | the runner already has 64 channels, or the client IP exceeded its rate                                                                            |
| 4006 | idle             | the Device sent no first message within 10 seconds                                                                                                |
| 4010 | pairing-rejected | sent by the Bridge: the pairing handshake was refused                                                                                             |
| 4011 | handshake-failed | sent by the Bridge: unknown mode byte, or its first message failed                                                                                |

A `CLOSE` frame from the Bridge closes the Device socket with the same code, including `1000`. A code the WebSocket protocol cannot carry (anything but `1000` and `3000`–`4999`) becomes `1011` and is logged. The Relay pings both links every 20 seconds. When a Runner link ends, all of its channels close with `4001`.

Every number above lives in [`src/limits.rs`](src/limits.rs) and the codes in [`src/frame.rs`](src/frame.rs).

## Commands

```sh
cargo run -p dsh-bot-relay -- serve [--bind ADDR] [--port PORT] [--ready-stdout] [--trusted-proxy IP] [--idle-ms MS]
cargo check -p dsh-bot-relay
cargo test -p dsh-bot-relay
cargo test -p dsh-bot-relay --features frame-tap
```

`--bind` is an IP address, default `127.0.0.1`. `--port` defaults to `8787`. Log level is `RUST_LOG`.

`--ready-stdout` prints `{"event":"ready","port":<port>}` once it listens, for scripts and tests.

`--trusted-proxy IP` can be repeated and defaults to none. Device rate limiting and logs use the TCP peer. Only when that peer is one of these addresses does the Relay read the client from `X-Forwarded-For`: the rightmost entry of the last header value, which is the address the proxy itself saw; entries left of it come from the client and are never used. No header, or a rightmost entry that is not a bare IP, keeps the peer. A peer that is not listed is never allowed to set the client, so a forged header cannot split the limit.

`--idle-ms MS` replaces the 10 second idle time (close code `4006`); tests use it so they need not wait. Deployments leave it out.

`--frame-tap PATH` appends every relayed binary frame as one JSON line — `{"seq":n,"link":"bridge"|"device","dir":"in"|"out","bytes":"<base64url>"}` — which is how the end-to-end test proves the Relay only ever sees ciphertext. The flag exists only in builds with the `frame-tap` feature, so a release build cannot record frames at all; the second `cargo test` line above turns it on for the test that reads the file back.

## Deploy

[`deploy/deploy.sh`](deploy/deploy.sh) puts the Relay on a VPS with one command; running it again upgrades.

### Before you start

| You need     | Requirement                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A VPS        | Debian or Ubuntu, x86_64 or arm64, systemd; SSH as root or as a user with sudo. 512 MB of memory is enough                                                                      |
| A domain     | An A record (plus AAAA with IPv6) pointing at the VPS. On Cloudflare make it DNS only (grey cloud): Caddy obtains the certificate itself and long-lived WebSockets skip the CDN |
| Ports        | 80 and 443 open to the internet (cloud security groups included) and not held by another program                                                                                |
| This machine | A checkout of this repository, `rustup`, `cargo` and `ssh`. No Docker or cross toolchain                                                                                        |

### One command

```sh
apps/relay/deploy/deploy.sh <ssh-target> <domain>
# e.g. apps/relay/deploy/deploy.sh root@203.0.113.7 relay.example.com
```

`<ssh-target>` can be a Host alias from `~/.ssh/config`. The script builds a static musl binary for the VPS's CPU on this machine (linked by Rust's own `rust-lld`), uploads it with [`deploy/install.sh`](deploy/install.sh) and runs that as root on the VPS, which:

1. checks that the domain resolves to the machine and that 80/443 are free;
2. installs Caddy from Caddy's official apt repository when it is missing;
3. installs `/usr/local/bin/dsh-bot-relay` and the systemd service `dsh-bot-relay`: `DynamicUser`, listening on `127.0.0.1:8787` only, `--trusted-proxy 127.0.0.1`;
4. writes `/etc/caddy/dsh-bot-relay.caddy` and imports it into the Caddyfile, so Caddy obtains and renews the certificate;
5. opens 80/443 when ufw is active;
6. waits until `https://<domain>/v1/health` answers.

Behind NAT, where the public IP is not on an interface, add `--skip-dns-check`.

### Afterwards

- **Point a Runner at it**: set `DSH_BOT_RELAY_URL=https://<domain>` for the Host. Not needed for the project's default Relay.
- **Upgrade**: pull and run the same command. The restart drops every tunnel; Runners and Devices reconnect.
- **Troubleshoot**: `curl https://<domain>/v1/health`; on the VPS, `journalctl -u dsh-bot-relay -u caddy -n 50`.
- **Remove** (on the VPS; Caddy stays):

```sh
systemctl disable --now dsh-bot-relay
rm /etc/systemd/system/dsh-bot-relay.service /usr/local/bin/dsh-bot-relay /etc/caddy/dsh-bot-relay.caddy
sed -i '\|^import /etc/caddy/dsh-bot-relay.caddy$|d' /etc/caddy/Caddyfile && systemctl reload caddy
```

## Known limitations

- It does not host the web Client. A browser reaches a Runner through its own transport, not this process.
- All state is in memory: a restart drops registrations and channels, and Devices reconnect.
- No persistence, no metrics endpoint, no per-owner accounting, no TLS termination of its own — deploy it behind a reverse proxy when it is public (see [Deploy](#deploy)).
- The connection rate limit counts each client IP in memory. Behind a reverse proxy, pass that proxy's address with `--trusted-proxy` (a loopback Caddy is `127.0.0.1`) so the Relay takes the client from `X-Forwarded-For`. Without it, every Device shares the proxy's one limit.
