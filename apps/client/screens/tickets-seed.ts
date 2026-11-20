/**
 * Test-only seed for the Ticket screenshots: a Bot, four Tickets at
 * different states (one opened by a Source), and the two Attentions that wait
 * on the Owner.
 */
import { MAIN_BOT_ID } from "../features/bots/model";
import { ready, registry } from "../features/bots/state";
import { createMemoryTickets } from "../features/tickets/memory";
import { followTickets } from "../features/tickets/state";
import { mainBot } from "../test/bots-fixture";
import { attention, question, ticket } from "../test/tickets-fixture";

const AT = Date.UTC(2026, 10, 20, 8, 30);

export function seedTickets(): void {
  const tickets = [
    ticket({
      id: "tidy",
      botId: MAIN_BOT_ID,
      title: "Tidy the release branch",
      request:
        "Rebase the release branch on main, drop the two stale fixups, and run the test suite.",
      sessionId: "s-tidy",
      status: "waiting",
    }),
    ticket({
      id: "compare",
      botId: MAIN_BOT_ID,
      title: "Compare the two export scripts",
      request: "Read both export scripts and say which one the release job should call.",
      sessionId: "s-compare",
      updatedAt: AT + 20 * 60_000,
    }),
    ticket({
      id: "notes",
      botId: MAIN_BOT_ID,
      title: "Summarize the deploy notes",
      request: "Summarize the deploy notes for the next release.",
      sessionId: "s-notes",
      status: "completed",
      result: "The notes describe one release train and no rollback step.",
      updatedAt: AT + 40 * 60_000,
    }),
    ticket({
      id: "telegram",
      botId: MAIN_BOT_ID,
      title: "Reply to the Telegram owner",
      request: "Answer the release question the owner sent on Telegram.",
      origin: {
        kind: "source",
        source: "telegram",
        sourceKind: "telegram",
        triggerId: "g1",
        thread: "owners",
        address: "42",
      },
      updatedAt: AT + 60 * 60_000,
    }),
  ];
  const attentions = [
    attention({
      id: "a1",
      ticketId: "tidy",
      prompt: "The rebase hit a conflict in the changelog. How should I resolve it?",
      questions: [
        question("q1", "Keep which side of the changelog?", [
          { label: "The release branch", description: "Keeps the version headings already cut." },
          { label: "Main", description: "Takes the newer entries from main." },
        ]),
      ],
    }),
    attention({
      id: "a2",
      ticketId: "compare",
      kind: "approval",
      prompt: "Run the release export script against the staging workspace?",
      toolName: "shell",
      reason: "It writes the export into the staging directory.",
      createdAt: AT + 20 * 60_000,
    }),
  ];

  followTickets(
    createMemoryTickets({
      tickets,
      attentions,
      sources: [
        {
          id: "telegram",
          kind: "telegram",
          title: { zh: "电报", en: "Telegram" },
          owner: "owner",
          enabled: true,
        },
      ],
    }),
  );
  registry.set(mainBot());
  ready.set(true);
}
