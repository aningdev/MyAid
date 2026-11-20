# dsh-tickets

English | [中文](README.zh.md)

Owns Tickets — work the Main Bot hands to a Bot — and the Attentions they wait on. Each Ticket runs in its own dsh Session under the target Bot's Agent preset; when that Session needs its Owner, the Ticket waits on an Attention instead of blocking silently, and any Device answers through the `tickets` Remote.

Decisions: [0002](../../docs/decisions/0002-main-bot-delegates-through-tickets.md). Terms: [GLOSSARY](../../docs/GLOSSARY.md). Plugin rules: [packages/AGENTS.md](../AGENTS.md).

## Data

| What                | Where                                                               |
| ------------------- | ------------------------------------------------------------------- |
| Tickets, Attentions | `<dataDir>/tickets.json`; `dataDir` defaults to `$DSH_HOME/tickets` |

The file is one version-1 document with a monotonic `revision`. Every write goes through a temp file and a rename, and settles the Ticket and its Attentions together, so a reader never sees half a transition. `snapshot` returns the Tickets plus the pending Attentions only; answered and withdrawn ones stay in the file as history.

A Host that stopped cannot answer what it was waiting on: on load, every pending Attention is withdrawn and its Ticket goes back to `open`.

## State machine

```text
open ──ask──▶ waiting ──answer / withdraw──▶ open
 │                │
 ├──completed ◀───┤        (turn ended with a result)
 ├──failed ◀──────┤        (Session error, or its Session could not start)
 └──cancelled ◀───┘        (Owner cancel; terminal)

completed | failed ──Owner message in the Ticket Session──▶ open
```

A Ticket's status belongs to the Ticket, not to its Session: an idle Session ends its turn, not necessarily the work (decision 0002). `cancelled` never comes back. An Attention goes `pending → answered` or `pending → withdrawn`.

## Sessions

`open` creates a Session with an explicit id (`ticket-session-<ticketId>`), the Bot's default workspace (or the requested one), and the target Bot's Agent preset, then names it best-effort and delivers the request. Messages this plugin delivers carry a `tickets` source, never `user`, so only a person typing in the Session counts as its Owner. The Session's model and thinking come from the Bot's preset.

## Main Bot

The Main Bot gets one tool, attached when its Agent is created (its own Sessions are recognised by preset or by the segment it owns):

| Tool          | Parameters                                              |
| ------------- | ------------------------------------------------------- |
| `ticket_open` | `bot` (name or id) · `title` · `task` · `workspacePath` |

Its description lists the ready Bots, so the Main Bot picks one without another round trip. When a Ticket ends, the result is delivered back into the opening Session as a `tickets` report message, so the Main Bot sees the outcome in its own conversation.

## Attention

A question or approval raised by a Ticket Session becomes an Attention: the Ticket turns `waiting`, the Session stays blocked, and the answer goes back to it. Requests from other Sessions, timed questions and sub-agent approvals fall through to dsh's own answerer.

## Remote

The Typert consumer face is exported as `./remote`.

| Method     | Effect                                                     |
| ---------- | ---------------------------------------------------------- |
| `snapshot` | Tickets and pending Attentions with the current revision   |
| `watch`    | Stream of snapshots, pushed after every write              |
| `answer`   | Answer one Attention; its Ticket reopens and resumes       |
| `cancel`   | Cancel a live Ticket as its Owner; its Attention withdraws |

## Commands

```sh
vp run dsh-tickets#build
vp run dsh-tickets#test
vp run dsh-tickets#check
```

`scripts/dev.mjs` builds this package and adds its row to the development overlay (`tickets.patch.yml`).

## Known limitations

- A Ticket completes when its Session's turn ends: work a Bot keeps doing outside a turn is not tracked.
- Only the Ticket Session's own questions and approvals raise Attentions; a sub-agent's approval is answered by dsh's answerer.
- The Tickets file is last-writer-wins by revision: two Devices writing at once are serialized on the Host, and the later write replaces the earlier one.
- Source registration (`sources`) is not implemented yet.
- The Client has no Tickets screen yet; the Remote is the only face.
