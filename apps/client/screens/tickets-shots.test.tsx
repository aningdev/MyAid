/**
 * Pictures of the Ticket surfaces: a Pane's Ticket band, the Attention inbox
 * and one Ticket's process on a desktop; and the three views at a phone's
 * 390×844. Headless runs stop at the probe; `nsh test --target macos` saves
 * them under `.handoff/shots`.
 */
import { expect, test } from "nsh/test";

import { MAIN_BOT_ID } from "../features/bots/model";
import { t } from "../lib/i18n";
import { botsStorage, mainBot } from "../test/bots-fixture";
import { open } from "../test/open";
import { attention, question, ticket, ticketsStorage } from "../test/tickets-fixture";
import { graphical, shoot } from "./shots";

const SHOTS = "../../.handoff/shots";
const AT = Date.UTC(2026, 10, 20, 8, 30);

test("the Ticket surfaces on a desktop", async () => {
  const storage = {
    ...botsStorage(mainBot()),
    ...ticketsStorage({
      tickets: [
        ticket({
          id: "tidy",
          botId: MAIN_BOT_ID,
          title: "Tidy the release branch",
          request: "Rebase the release branch on main and run the suite.",
          status: "waiting",
        }),
      ],
      attentions: [
        attention({
          id: "a1",
          ticketId: "tidy",
          prompt: "The rebase hit a conflict in the changelog. How should I resolve it?",
          questions: [
            question("q1", "Keep which side of the changelog?", [
              { label: "The release branch", description: null },
              { label: "Main", description: null },
            ]),
          ],
        }),
      ],
    }),
  };
  const app = await open("../App.tsx", {
    platform: "web",
    width: 1200,
    height: 860,
    storage,
  });
  if (!(await graphical(app))) {
    expect(app.texts().length).toBeGreaterThan(0);
    return;
  }

  await app.waitFor("label:Main Bot");
  await app.press("label:Main Bot");
  await shoot(app, "desktop-01-pane-tickets.png", SHOTS);

  await app.press("id:nav-attention");
  await shoot(app, "desktop-02-attention-inbox.png", SHOTS);

  await app.press("id:attention-a1");
  await shoot(app, "desktop-03-ticket.png", SHOTS);
});

test("the Ticket views at a phone's width", async () => {
  const shots = [
    ["mobile-01-tickets.png", "./tickets-list-harness.tsx"],
    ["mobile-02-ticket.png", "./tickets-detail-harness.tsx"],
    ["mobile-03-attention.png", "./tickets-inbox-harness.tsx"],
  ] as const;

  for (const [name, entry] of shots) {
    const app = await open(entry, { platform: "web", width: 390, height: 844 });
    if (!(await graphical(app))) {
      expect(app.texts().length).toBeGreaterThan(0);
      continue;
    }
    await shoot(app, name, SHOTS);
  }
});
