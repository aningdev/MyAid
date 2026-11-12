# Screenshot and smoke harnesses

These tests open the real app. A headless `nsh test` run has nothing to draw:
each harness takes a picture probe at the start and returns when the platform
cannot draw, so the normal suite stays green. On a graphical target it runs
the steps and saves PNGs under the scratchpad directory named in
[`shots.ts`](shots.ts) (`SHOTS` for the B5 batch, `SHOTS_W2` for W2).

```sh
# Welcome: no Bots, so back up ~/.myaid/registry/bots.json (or move it aside),
# run, then put it back. 01-welcome.png
nsh test screens/b5-welcome.test.tsx --target macos

# Seeded registry + client prefs: marks, New Bot, ⌘K, a context menu.
# Swap ~/.myaid/registry/bots.json and ~/.myaid/prefs/client.json for a
# fixture, run, then put the real files back.
nsh test screens/b5-shot.test.tsx --target macos

# A 22-item ordered list over the harness (no Host): the marker column.
nsh test screens/w2-list.test.tsx --target macos

# fs grants as the app really has them (reads of ~/.myaid, refusals outside).
nsh test screens/w2-fs.test.tsx --target macos
```

## Real-Host smokes: never the user's registry

A smoke creates a Bot, a Dialogue and a Session as the product does. Point both
halves at a scratch root instead of `~/.myaid`:

```sh
SC=<scratchpad>/w2run
mkdir -p "$SC/data" "$SC/home"
# dsh's login lives in the data root: copy it in (never commit it).
cp -p ~/.myaid/.credentials.yaml ~/.myaid/.anonymous-user-id "$SC/data/"
chmod 700 "$SC/data"

# The Host, on the scratch data root. The socket path stays short: a Unix
# socket path has ~104 bytes.
MYAID_HOST_SOCKET=/tmp/myaid-host.sock \
  ./target/debug/myaid-host serve --data-root "$SC/data" --official-dsh &

# The client, with the scratch home (its registry and prefs) and the same
# socket. cargo and rustup need their real directories through the HOME
# override.
real_home="$HOME"
HOME="$SC/home" RUSTUP_HOME="$real_home/.rustup" CARGO_HOME="$real_home/.cargo" \
  MYAID_HOST_SOCKET=/tmp/myaid-host.sock \
  nsh test screens/w2-smoke.test.tsx --target macos
```

Then stop the Host and delete the scratch root: it holds a copy of the dsh
credentials. A headless run stops at the picture probe.

`nsh test --target macos` can drive presses, typing and screenshots, but not
the gestures that need a system dialog or dropped paths: `onPick` is headless
only, and `paste`/`dropFiles` deliver no files on a real desktop. Attachments
are therefore covered by `chat-harness.test.tsx` (the picker, a paste and a
drop, over a stand-in for `fs`) and `screens/w2-fs.test.tsx` (the real grant),
not by the smoke.
