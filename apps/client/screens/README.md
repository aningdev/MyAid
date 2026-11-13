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

`*.smoke.test.tsx` returns unless `MYAID_SMOKE_HOST` is set, so no default
`nsh test` run needs a live Host — and that variable is also the only way a
test app reaches the local control plane at all (`test/host-control.test.tsx`). The app starts the Host itself (`lib/host/launcher`), so nothing has to
be running beforehand: give the app a scratch home and `myaid-host` on PATH.

```sh
SC=<scratchpad>/smoke-run
mkdir -p "$SC/home/.myaid"
# dsh's login lives in the data root: copy it in (never commit it), and give
# the Host's login shell the provider key the real one exports.
cp -p ~/.myaid/.credentials.yaml ~/.myaid/.anonymous-user-id "$SC/home/.myaid/"
chmod 700 "$SC/home/.myaid"
printf 'export DEEPSEEK_API_KEY=%s\n' "$DEEPSEEK_API_KEY" > "$SC/home/.zshenv"

# Build the Host once; the launcher resolves the name `myaid-host` on PATH.
cargo build -p myaid-host

real_home="$HOME"
HOME="$SC/home" RUSTUP_HOME="$real_home/.rustup" CARGO_HOME="$real_home/.cargo" \
  MYAID_SMOKE_HOST=1 MYAID_HOST_PORT=4879 \
  PATH="$PWD/target/debug:$PATH" \
  nsh test screens/host-launcher.smoke.test.tsx --target macos
```

`screens/host-launcher.smoke.test.tsx` proves the native layer end to end: a
cold start where the app launches the Host, a turn, a Host stopped from
outside (`screens/host-restart-watch.mjs`, started with `--root <home>/.myaid
--port 4879 --after-turns 2`) and restarted by the launcher, the same
conversation answered again on the new Host, and (with `MYAID_SMOKE_HOST=empty`)
the footer's empty state with the manual command. Its pictures go to
`shots.ts`'s `SHOTS_N1`.

The other real-Host smokes (`real-turn`, `new-bot-real-host`,
`dialogue-workspace`, `bot-presets-real-host`, `session-model`,
`session-restart`) run the same way; `session-restart` still expects
`screens/host-restart-watch.mjs --after-turns 1` to stop the Host mid-turn.

Then stop the Host and delete the scratch root: it holds a copy of the dsh
credentials. A headless run stops at the picture probe.

`dialogue-workspace.smoke.test.tsx` proves a Dialogue is one Bot's view of a
dsh Workspace: two Bots open the same directory (one Workspace, two
Dialogues), a rename retitles the shared Workspace, Favorites reads dsh's pin
set, an idle Session archives, a running one is refused as
`workspace/session-active` and then stopped and archived, a whole Dialogue archived
through the same confirmation, and a second app opened with the first one's
registry reads title, pin and archive back from dsh. It renames `/tmp`'s
Workspace, so run it on a fresh scratch data root (recreate the root and
restart the Host between runs).

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
