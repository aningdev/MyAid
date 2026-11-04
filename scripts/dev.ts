/**
 * Dev launcher principle (from dsh-bot):
 * Reuse or start the Host listening on ~/.myaid/host/control.sock, then run NSH.
 * Do not spawn dsh from the client; Host owns lifecycle. Explicit MYAID_HOST_SOCKET
 * means connect-only (caller must already have a Host).
 *
 * Empty shell: only launches the client; Host/dsh stay manual.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const client = spawn('bun', ['run', '--cwd', 'apps/client', 'dev'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    MYAID_HOST_SOCKET:
      process.env.MYAID_HOST_SOCKET ?? `${process.env.HOME}/.myaid/host/control.sock`,
  },
})

client.on('exit', code => {
  process.exit(code ?? 1)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    client.kill(signal)
  })
}
