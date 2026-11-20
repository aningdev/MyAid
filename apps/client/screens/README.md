# Screenshot and smoke harnesses

These tests open the real app. A headless `nsh test` run has nothing to draw:
each harness takes a picture probe at the start and returns when the platform
cannot draw, so the normal suite stays green. On a graphical target it runs
the steps and saves PNGs under `~/.dsh-bot-dev/shots/` ([`shots.ts`](shots.ts)), beside the
isolated dev roots and never in the real `~/.dsh-bot`. The test runner cannot
create folders: `mkdir -p ~/.dsh-bot-dev/shots/pi-shots-{shell,chat,a1,p1,l1,l2,d2,n1,l3,l4}`
first, or a picture is skipped.

```sh
# Welcome: the test app's isolated storage is empty, never the real ~/.dsh-bot.
nsh test screens/welcome.test.tsx --target macos

# Seeded registry + client prefs in the app's isolated test storage: the Bot
# list with its Pin group, the palette and a row's menu.
nsh test screens/navigator-marks.test.tsx --target macos

# A 22-item ordered list over the harness (no Host): the marker column.
nsh test screens/ordered-list-markers.test.tsx --target macos

# fs grants as the app really has them (refusals outside; the real ~/.dsh-bot is not read).
nsh test screens/fs-grant.test.tsx --target macos

# Settings › Background Services over a stand-in Host control channel (no Host).
nsh test screens/settings-background.test.tsx --target macos

# The Bot app's Panes, Bot details and Settings overlay (seeded, no Host).
nsh test screens/l1-shots.test.tsx --target macos

# Settings' four groups in light and dark, over the fake Host.
nsh test screens/settings-shots.test.tsx --target macos
# One long conversation's divider, history rail and directory change (scripted).
nsh test screens/l2-shots.test.tsx --target macos
```

## Real-Host smokes: opt-in, and never the user's registry

`*.smoke.test.tsx` returns unless `DSH_BOT_SMOKE_HOST` is set, so no default
`nsh test` run needs a live Host — and that variable is also the only way a
test app reaches the local control plane at all (`test/host-control.test.tsx`). The app starts the Host itself (`lib/host/launcher`), so nothing has to
be running beforehand: give the app a scratch home and `dsh-bot-host` on PATH.

```sh
SC=<scratchpad>/smoke-run
mkdir -p "$SC/home/.dsh-bot"
# dsh's login lives in the data root: copy it in (never commit it), and give
# the Host's login shell the provider key the real one exports.
cp -p ~/.dsh-bot/.credentials.yaml ~/.dsh-bot/.anonymous-user-id "$SC/home/.dsh-bot/"
chmod 700 "$SC/home/.dsh-bot"
printf 'export DEEPSEEK_API_KEY=%s\n' "$DEEPSEEK_API_KEY" > "$SC/home/.zshenv"

# Build the Host once; the launcher resolves the name `dsh-bot-host` on PATH.
cargo build -p dsh-bot-host

real_home="$HOME"
HOME="$SC/home" RUSTUP_HOME="$real_home/.rustup" CARGO_HOME="$real_home/.cargo" \
  DSH_BOT_SMOKE_HOST=1 DSH_BOT_HOST_PORT=4879 \
  PATH="$PWD/target/debug:$PATH" \
  nsh test screens/host-launcher.smoke.test.tsx --target macos
```

`screens/host-launcher.smoke.test.tsx` proves the native layer end to end: a
cold start where the app launches the Host, a turn, a Host stopped from
outside (`screens/host-restart-watch.mjs`, started with `--root <home>/.dsh-bot
--port 4879 --after-turns 2`) and restarted by the launcher, the same
conversation answered again on the new Host, and (with `DSH_BOT_SMOKE_HOST=empty`)
the footer's empty state with the manual command. Its pictures go to
`shots.ts`'s `SHOTS_N1`.

The other real-Host smokes (`real-turn`, `new-bot-real-host`, `bot-app`,
`bots-real-host`, `session-model`, `session-restart`,
`settings-real-host`, `long-conversation`) run the same way;
`session-restart` still expects
`screens/host-restart-watch.mjs --after-turns 1` to stop the Host mid-turn.

`settings-real-host` writes a provider base URL into the scratch root's dsh
settings (the profile's `cordis.patch.yml`), which a later smoke on that same
root would then call models through: give it a scratch root of its own.

Then stop the Host and delete the scratch root: it holds a copy of the dsh
credentials. A headless run stops at the picture probe.

`bot-app.smoke.test.tsx` proves the Bot app's shell against a live Host: two
Bots over two directories dragged into two Panes stream at the same time, one
is Pinned, Bot details renames the other (the list and the Pane title follow),
and a second launch on the registry and prefs the first one wrote restores the
Panes, their Bots and the Pin.

`settings-real-host.smoke.test.tsx` sets a fake DeepSeek key through
Settings, clears it, writes a base URL and the default model into dsh's
settings and reads them back after reopening, then checks About's versions
and that the dark scheme survives a relaunch. The scratch
`.credentials.yaml` holds no key once the page's **清除 Key** has run.

`long-conversation.smoke.test.tsx` proves one Bot's long conversation against a
live Host: a first segment in one directory, a new segment after changing the
directory in the header, `/new`, the history rail's keyboard jump back to the
first segment, a prompt sent while scrolled up going to the latest segment, and
a second launch that restores all three segments. Its pictures go to
`SHOTS_L2`.

`bots-real-host.smoke.test.tsx` additionally needs `dsh-bots` on the Host
command line: `vp run dsh-bots#build`, then point `DSH_BOT_PATCH` at an
overlay that `--patch`es the built `packages/bots/lib/index.js`. It saves a
plugin switch, checks the derived preset through `agentPresets.read`, and
starts a new Session under it. The same file creates a Bot named `Smoke Bot`
through New Bot and checks that `$DSH_BOT_HOME/bots/registry.json` contains it
and the Navigator shows it. `DSH_BOT_HOME` must be a directory under
`~/.dsh-bot-dev`; the test refuses any other root.

`nsh test --target macos` can drive presses, typing and screenshots, but not
the gestures that need a system dialog or dropped paths: `onPick` is headless
only, and `paste`/`dropFiles` deliver no files on a real desktop. Attachments
are therefore covered by `chat-harness.test.tsx` (the picker, a paste and a
drop, over a stand-in for `fs`) and `screens/fs-grant.test.tsx` (the real grant),
not by the smoke.
