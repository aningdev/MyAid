# Screenshot and smoke harnesses

These tests open the real app. A headless `nsh test` run has nothing to draw:
each harness takes a picture probe at the start and returns when the platform
cannot draw, so the normal suite stays green. On a graphical target it runs
the steps and saves PNGs under the scratchpad directory named in
[`shots.ts`](shots.ts).

```sh
# Welcome: the test app's isolated storage is empty, never the real ~/.myaid.
nsh test screens/welcome.test.tsx --target macos

# Seeded registry + client prefs in the app's isolated test storage.
nsh test screens/navigator-marks.test.tsx --target macos

# A 22-item ordered list over the harness (no Host): the marker column.
nsh test screens/ordered-list-markers.test.tsx --target macos

# fs grants as the app really has them (refusals outside; the real ~/.myaid is not read).
nsh test screens/fs-grant.test.tsx --target macos

# Settings › Background Services over stand-in control channels (no Host).
nsh test screens/settings-background.test.tsx --target macos
```

## Real-Host smokes: opt-in, and never the user's registry

`*.smoke.test.tsx` returns unless `MYAID_SMOKE_HOST_SOCKET` is set, so no
default `nsh test` run needs a live Host. The real-Host smokes create a Bot, a
Dialogue and a Session as the product does. Point both halves at a scratch
root instead of `~/.myaid`:

```sh
SC=<scratchpad>/smoke-run
mkdir -p "$SC/data" "$SC/home"
# dsh's login lives in the data root: copy it in (never commit it).
cp -p ~/.myaid/.credentials.yaml ~/.myaid/.anonymous-user-id "$SC/data/"
chmod 700 "$SC/data"

# The Host, on the scratch data root. The socket path stays short: a Unix
# socket path has ~104 bytes.
MYAID_HOST_SOCKET=/tmp/myaid-smoke-host.sock \
  ./target/debug/myaid-host serve --data-root "$SC/data" --official-dsh &

# The client, with the scratch home (its registry and prefs) and the same
# socket. cargo and rustup need their real directories through the HOME
# override.
real_home="$HOME"
HOME="$SC/home" RUSTUP_HOME="$real_home/.rustup" CARGO_HOME="$real_home/.cargo" \
  MYAID_SMOKE_HOST_SOCKET=/tmp/myaid-smoke-host.sock \
  MYAID_HOST_SOCKET=/tmp/myaid-smoke-host.sock \
  nsh test screens/new-bot-real-host.smoke.test.tsx --target macos
```

Then stop the Host and delete the scratch root: it holds a copy of the dsh
credentials. A headless run stops at the picture probe.

`bot-presets-real-host.smoke.test.tsx` additionally needs
`myaid-plugin-bot-presets` on the Host command line (`--patch` its built
`lib/index.js`). It saves a plugin switch, checks the derived preset through
`agentPresets.read`, and starts a new Session under it.

`nsh test --target macos` can drive presses, typing and screenshots, but not
the gestures that need a system dialog or dropped paths: `onPick` is headless
only, and `paste`/`dropFiles` deliver no files on a real desktop. Attachments
are therefore covered by `chat-harness.test.tsx` (the picker, a paste and a
drop, over a stand-in for `fs`) and `screens/fs-grant.test.tsx` (the real grant),
not by the smoke.
