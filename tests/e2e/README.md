# @dsh-bot/e2e

English | [中文](README.zh.md)

End-to-end tests for the Relay tunnel: a real Relay, a real Host with its Bridge and the Client's real relay Carrier, all on loopback, with only dsh web faked. They prove spec acceptance 8 (the Relay sees no content) and 9 (a revoked Device is cut off at once); see [relay-tunnel · 验证](../../docs/architecture/relay-tunnel.md#验证).

## Commands

```sh
bun run test:e2e                    # from the root: builds the binaries, then runs every case
vp run @dsh-bot/e2e#test:e2e        # the same, for this package alone
vp run @dsh-bot/e2e#check           # type-check the cases
```

Its budget and when it runs are in [testing](../../docs/architecture/testing.md). It never touches `~/.dsh-bot`, `~/.dsh-bot-dev` or the project Relay, and installs no service.

## What a case gets

`startStack()` in [`support/harness.ts`](support/harness.ts) starts, for each test file:

| Process               | Started as                                                                                                | Notes                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `dsh-bot-relay`       | `serve --bind 127.0.0.1 --port 0 --ready-stdout --frame-tap <file>`                                       | Built with the `frame-tap` feature; the tap file lists every relayed frame.                        |
| fake dsh web          | in the test process ([`support/fake-dsh.ts`](support/fake-dsh.ts))                                        | The login exchange, `POST /api/echo`, `/api/slow` and `/api/remote.mux`.                           |
| `fake-dsh` executable | a shell script in the temp dir                                                                            | Answers `--version`, then prints the fake dsh web's login URL and sleeps; the Host runs it as dsh. |
| `dsh-bot-host`        | `serve --data-root <temp>/data --dsh <fake-dsh> --port 0 --ready-stdout`, `DSH_BOT_RELAY_URL` = the Relay | Started through `POST /dsh/start`; its Bridge registers with the Relay.                            |

The Device is the Client's own relay Carrier, imported from `@dsh-bot/client/relay` ([`apps/client/lib/carrier/relay/index.ts`](../../apps/client/lib/carrier/relay/index.ts)); nothing is copied. The two NSH modules it imports, `nsh` and `websocket`, are replaced by [`support/nsh.ts`](support/nsh.ts) and [`support/websocket.ts`](support/websocket.ts) through `resolve.alias` in [`vite.config.ts`](vite.config.ts). [`support/device.ts`](support/device.ts) pairs a Device through `POST /bridge/pairing`: the link goes from the response straight to `pairDevice` in memory, and is never written to a file or a log.

`stop()` ends every process and deletes the temp directory, pass or fail.

## Cases

| File                                                                             | Acceptance | Proves                                                                                                |
| -------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| [`cases/relay-sees-no-content.test.ts`](cases/relay-sees-no-content.test.ts)     | 8          | No marker, Device key or device id in any tapped frame; every frame is header plus ciphertext.        |
| [`cases/revocation-is-immediate.test.ts`](cases/revocation-is-immediate.test.ts) | 9          | A revoked Device's live stream fails, its pairing is cleared, its old identity gets `device-revoked`. |
| [`cases/frames.test.ts`](cases/frames.test.ts)                                   | —          | The tap reader finds a marker in any spelling and flags a frame that is not ciphertext.               |
