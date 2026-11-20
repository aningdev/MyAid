# @dsh-bot/e2e

English | [中文](README.zh.md)

End-to-end tests on loopback, in two stacks. The Relay tunnel runs a real Relay, a real Host with its Bridge and the Client's real relay Carrier with only dsh web faked; it proves spec acceptance 8 (the Relay sees no content) and 9 (a revoked Device is cut off at once), see [relay-tunnel · 验证](../../docs/architecture/relay-tunnel.md#验证). The multi-Device stack puts the real dsh web behind the Host, with this repo's plugins and a scripted model provider, and drives it from two Devices through the Client's real Connection; it proves acceptance 3 (the Main Bot cannot be deleted), 4 (the Registry is the same everywhere), 5 (the Ticket lifecycle) and 6 (an Attention is reachable from every Device).

## Commands

```sh
bun run test:e2e                    # from the root: builds the binaries, then runs every case
vp run @dsh-bot/e2e#test:e2e        # the same, for this package alone
vp run @dsh-bot/e2e#check           # type-check the cases
```

Its budget and when it runs are in [testing](../../docs/architecture/testing.md). It never touches `~/.dsh-bot`, `~/.dsh-bot-dev` or the project Relay, and installs no service.

## What a case gets

### The fake dsh stack

`startStack()` in [`support/harness.ts`](support/harness.ts) starts, for each test file:

| Process               | Started as                                                                                                | Notes                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `dsh-bot-relay`       | `serve --bind 127.0.0.1 --port 0 --ready-stdout --frame-tap <file>`                                       | Built with the `frame-tap` feature; the tap file lists every relayed frame.                        |
| fake dsh web          | in the test process ([`support/fake-dsh.ts`](support/fake-dsh.ts))                                        | The login exchange, `POST /api/echo`, `/api/slow` and `/api/remote.mux`.                           |
| `fake-dsh` executable | a shell script in the temp dir                                                                            | Answers `--version`, then prints the fake dsh web's login URL and sleeps; the Host runs it as dsh. |
| `dsh-bot-host`        | `serve --data-root <temp>/data --dsh <fake-dsh> --port 0 --ready-stdout`, `DSH_BOT_RELAY_URL` = the Relay | Started through `POST /dsh/start`; its Bridge registers with the Relay.                            |

The Device is the Client's own relay Carrier, imported from `@dsh-bot/client/relay` ([`apps/client/lib/carrier/relay/index.ts`](../../apps/client/lib/carrier/relay/index.ts)); nothing is copied. The two NSH modules it imports, `nsh` and `websocket`, are replaced by [`support/nsh.ts`](support/nsh.ts) and [`support/websocket.ts`](support/websocket.ts) through `resolve.alias` in [`vite.config.ts`](vite.config.ts). [`support/device.ts`](support/device.ts) pairs a Device through `POST /bridge/pairing`: the link goes from the response straight to `pairDevice` in memory, and is never written to a file or a log.

`stop()` ends every process and deletes the temp directory, pass or fail.

### The real dsh stack

`startRealStack(script)` in [`support/real-stack.ts`](support/real-stack.ts) reuses the same Relay and Host ([`startPlumbing`](support/harness.ts)) and replaces everything behind the Host:

| Part                          | Started as                                                                                 | Notes                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the pinned `@deepseek-ai/dsh` | the Host's `--dsh <its lib/bin.js> --patch <temp>/plugins.patch.yml`                       | The patch inserts `dsh-bots` and `dsh-tickets` from `packages/*/lib`, as `prepareOverlay` in `scripts/dev.mjs` does. `test:e2e` builds both first.      |
| model provider                | in the test process ([`support/llm.ts`](support/llm.ts))                                   | `@deepseek-ai/dsh-llm-mock-server` for the wire, behind a router that picks the answer from the request (see below). The key is the fixed `mock-key`.   |
| dsh's environment             | `HOME` = `<temp>/home`, whose `.zshenv` exports `DEEPSEEK_BASE_URL` and `DEEPSEEK_API_KEY` | The Host builds dsh's environment from a login shell, so this is the one channel that reaches dsh; the Owner's own login files and keys are never read. |

**The script.** The mock server consumes a fixed sequence whatever is asked and can emit only one configured tool call, but a case needs the model to answer by who asks and what came before. `startLlm(script)` therefore starts one mock instance per distinct step and a router that reads each request into a `Turn` (the tools offered, the last user text, the last tool result) and calls `script(turn)`, which returns a text or one tool call. The router forwards the request to the matching instance and gives each tool call its own id. A Ticket Session is told apart from the Main Bot's by `ticket_report`, which only it is given. `llm.turn(match)` resolves when a request matching `match` has arrived, which is how a case waits for "the result came back into the Main Bot's Session" without sleeping.

**Devices.** [`connectedDevice`](support/device.ts) pairs a Device and connects the Client's `Connection` (from `@dsh-bot/client/dsh`) through its Carrier, so the Remote calls and `watch` streams are the product's own gateways. [`support/watch.ts`](support/watch.ts) keeps every snapshot of a `watch` and resolves `until(match)` when one arrives; nothing waits on time.

**One stack per file.** Test files run in parallel, and the Registry and the Tickets file are mutated by the cases, so each file starts its own stack (about a second); the tests inside a file share it and do not depend on each other. The npm package is a dev dependency of this package (`"catalog:"`, the same version as every other dsh pin), so the real-dsh files run wherever the dependencies are installed and fail, never skip, when dsh cannot start.

## Cases

| File                                                                             | Acceptance | Proves                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`cases/relay-sees-no-content.test.ts`](cases/relay-sees-no-content.test.ts)     | 8          | No marker, Device key or device id in any tapped frame; every frame is header plus ciphertext.                                                                                                               |
| [`cases/revocation-is-immediate.test.ts`](cases/revocation-is-immediate.test.ts) | 9          | A revoked Device's live stream fails, its pairing is cleared, its old identity gets `device-revoked`.                                                                                                        |
| [`cases/registry-is-consistent.test.ts`](cases/registry-is-consistent.test.ts)   | 4, 3       | A Bot created and renamed on one Device reaches the other Device's `watch`; deleting the Main Bot through the Relay is rejected.                                                                             |
| [`cases/ticket-attention.test.ts`](cases/ticket-attention.test.ts)               | 5, 6       | The Main Bot opens a Ticket under another Bot; its question is an Attention on both Devices; answering on one clears it on the other; the Ticket completes and the result returns to the Main Bot's Session. |
| [`cases/frames.test.ts`](cases/frames.test.ts)                                   | —          | The tap reader finds a marker in any spelling and flags a frame that is not ciphertext.                                                                                                                      |
