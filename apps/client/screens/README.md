# Screenshot and smoke harnesses

These tests open the real app. A headless `nsh test` run has nothing to draw:
each harness takes a picture probe at the start and returns when the platform
cannot draw, so the normal suite stays green. On a graphical target it runs
the steps and saves PNGs under
`/private/tmp/claude-501/-Users-zhuxining-Code-MyAid/fcf60928-6235-47f5-bea3-690051a88ab8/scratchpad/pi-shots-b5`
(set in [`shots.ts`](shots.ts)).

```sh
# Welcome: no Bots, so back up ~/.myaid/registry/bots.json (or move it aside),
# run, then put it back. 01-welcome.png
nsh test screens/b5-welcome.test.tsx --target macos

# Seeded registry + client prefs: marks, New Bot, ⌘K, a context menu.
# Swap ~/.myaid/registry/bots.json and ~/.myaid/prefs/client.json for a
# fixture, run, then put the real files back.
nsh test screens/b5-shot.test.tsx --target macos

# Real Host smoke: create a Bot through the sheet and get a reply.
bun scripts/dev.mjs                       # repository root, another shell
nsh test screens/b5-smoke.test.tsx --target macos
```

The smoke writes a `B5 Smoke` Bot and its first Dialogue into the real
registry (as the product would) and sends one prompt to dsh.
