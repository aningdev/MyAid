# dsh-tickets

English | [中文](README.zh.md)

Owns Tickets — work the Main Bot hands to a Bot — the Attentions they wait on, and the `sources` service Source plugins register through. Each Ticket runs in its own dsh Session under the target Bot's Agent preset; when that Session needs its Owner, the Ticket waits on an Attention instead of blocking silently, and any Device answers through the `tickets` Remote. A Trigger that arrives from a Source is recorded here first, and only the Owner's identity can turn it into work.

Decisions: [0002](../../docs/decisions/0002-main-bot-delegates-through-tickets.md). Terms: [GLOSSARY](../../docs/GLOSSARY.md). Plugin rules: [packages/AGENTS.md](../AGENTS.md).

## Data

| What                          | Where                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| Tickets, Attentions, Triggers | `<dataDir>/tickets.json`; `dataDir` defaults to `$DSH_HOME/tickets` |

The file is one version-2 document with a monotonic `revision`. Every write goes through a temp file and a rename, and settles the Ticket and its Attentions together, so a reader never sees half a transition. `snapshot` returns the Tickets, the pending Attentions only, the configured Sources, every delivered Trigger, and the Source threads that already have a Main Bot Session; answered, withdrawn and ignored ones stay in the file as history.

A Host that stopped cannot answer what it was waiting on: on load, every pending Attention is withdrawn and its Ticket goes back to `open`.

## State machine

```text
open ──ask──▶ waiting ──answer / withdraw──▶ open
 │                │
 ├──completed ◀───┤        (`ticket_report`: completed)
 ├──failed ◀──────┤        (`ticket_report`: failed, Session error, or Session did not start)
 └──cancelled ◀───┘        (Owner cancel; terminal)

completed | failed ──Owner message in the Ticket Session──▶ open
```

A Ticket's status belongs to the Ticket, not to its Session: a turn ending is not an outcome (decision 0002). After an idle turn the Ticket stays `open`; its Bot ends it by reporting once through `ticket_report`, which is the explicit completion signal. `cancelled` never comes back. An Attention goes `pending → answered` or `pending → withdrawn`.

## Source

The plugin provides the `sources` Cordis service (`ctx.sources`). A Source plugin registers one kind and one configured instance as a single effect; the returned function removes both:

```ts
ctx.sources.register({
  kind: {
    kind: "feishu",
    title: { zh: "飞书", en: "Feishu" },
    description: "Owner 的飞书会话",
    config: z.object({ ownerOpenId: z.string(), appId: z.string(), appSecret: z.string() }),
    owner: (config) => config.ownerOpenId,
    channel: { send: async (instance, message) => "sent" },
  },
  instance: { id: "feishu-owner", enabled: true, config: { … } },
});
```

- `owner(config)` names the Owner's identity on this Source. No trigger maps identities across Sources.
- `channel.send(instance, { thread, address, text })` is the write end: the Source plugin posts `text` to `address` and answers `sent` or `gone`.
- The Source plugin delivers Triggers with `ctx.sources.deliver(instanceId, { id, thread, address, at, human, text })`. The return value is `accepted`, `ignored` or `duplicate`.

The Trigger is immutable once delivered and is stored with its disposition; a repeated `id` on the same Source is a `duplicate` and changes nothing. Only a Trigger whose `human.id` equals the Source's Owner identity is `accepted`; the others are recorded as `ignored`, open no Session, call no model and get no Channel reply.

An accepted Trigger goes to the Main Bot Session that follows that `(Source, thread)` — created on first use with the Main Bot preset and named after the Source and thread — as a `tickets` message carrying the trigger marker. The Main Bot answers in that Session:

- `ticket_open` binds the oldest pending Trigger of that thread, records it as the Ticket's origin (Source, kind, trigger id, thread, address), and sends exactly one Channel confirmation;
- ending the turn without a Ticket writes the last assistant message back through the same Channel, once;
- when the Ticket ends, its result goes back through the same Channel to the original address.

## Sessions

`open` creates a Session with an explicit id (`ticket-session-<ticketId>`), the Bot's default workspace (or the requested one), and the target Bot's Agent preset, then names it best-effort and delivers the request. Messages this plugin delivers carry a `tickets` source, never `user`, so only a person typing in the Session counts as its Owner. The Session's model and thinking come from the Bot's preset.

A sub-agent Session resolves to the Ticket of the Session that spawned it (`parentSession`), so its questions and approvals raise that Ticket's Attentions. Timed questions still go to dsh's own answerer.

## Main Bot

Tools are attached when an Agent is created: `ticket_open` on the Main Bot's own Sessions (recognised by preset or by the segment it owns), `ticket_report` on every Ticket Session.

| Tool            | Parameters                                              |
| --------------- | ------------------------------------------------------- |
| `ticket_open`   | `bot` (name or id) · `title` · `task` · `workspacePath` |
| `ticket_report` | `status` (`completed` or `failed`) · `result`           |

`ticket_open`'s description lists the ready Bots, so the Main Bot picks one without another round trip. `ticket_report` is how a Ticket's Bot ends its work; reporting again after the end is refused. When a Ticket opened in a Main Bot Session ends, the result is delivered back into the opening Session as a `tickets` report message.

## Attention

A question or approval raised by a Ticket Session becomes an Attention: the Ticket turns `waiting`, the Session stays blocked, and the answer goes back to it. Requests outside a Ticket (including timed questions) fall through to dsh's own answerer.

## Remote

The Typert consumer face is exported as `./remote`.

| Method     | Effect                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| `snapshot` | Tickets, pending Attentions, Sources and Triggers with the current revision |
| `watch`    | Stream of snapshots, pushed after every write                               |
| `answer`   | Answer one Attention; its Ticket reopens and resumes                        |
| `cancel`   | Cancel a live Ticket as its Owner; its Attention withdraws                  |

## Commands

```sh
vp run dsh-tickets#build
vp run dsh-tickets#test
vp run dsh-tickets#check
```

`scripts/dev.mjs` builds this package and adds its row to the development overlay (`plugins.patch.yml`).

## Known limitations

- A Bot must call `ticket_report`; a turn that ends without it leaves the Ticket `open`, not completed.
- Timed questions go to dsh's answerer; only questions and approvals without a timeout reach an Attention.
- Writes are serialized inside the Host process and replace the whole document: two Devices writing at once apply in arrival order, and `revision` is not a conflict token.
- One Main Bot Session per `(Source, thread)`; several Triggers delivered in a row bind to Tickets one at a time.
- The Client has no Tickets screen yet; the Remote is the only face.
