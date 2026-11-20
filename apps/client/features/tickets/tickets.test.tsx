/**
 * Tickets and Attention over the in-memory Remote: a Bot's Pane lists the
 * Tickets it executed, a Ticket opens its own Session, an answered Attention
 * leaves every list, and cancelling a live Ticket changes its state.
 */
import { expect, test, type Dialog } from "nsh/test";

import { t } from "../../lib/i18n";
import { botsStorage, mainBot } from "../../test/bots-fixture";
import { open } from "../../test/open";
import {
  attention,
  question,
  TICKETS_FIXTURE_KEY,
  ticket,
  ticketsStorage,
} from "../../test/tickets-fixture";
import { MAIN_BOT_ID } from "../bots/model";

const desktop = { platform: "web" as const, width: 1200, height: 860 };

function storage(attentions: ReturnType<typeof attention>[] = []): Record<string, string> {
  return {
    ...botsStorage(mainBot()),
    ...ticketsStorage({
      tickets: [
        ticket({
          id: "t1",
          botId: MAIN_BOT_ID,
          title: "Tidy the release branch",
          request: "Tidy the release branch and run its tests.",
          sessionId: "s-ticket",
        }),
        ticket({
          id: "t2",
          botId: MAIN_BOT_ID,
          title: "Reply on Telegram",
          origin: {
            kind: "source",
            source: "telegram",
            sourceKind: "telegram",
            triggerId: "g1",
            thread: "owners",
            address: "42",
          },
        }),
      ],
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
  };
}

test("a Bot's Pane lists the Tickets it executed", async () => {
  const app = await open("../../App.tsx", { ...desktop, storage: storage() });
  await app.waitFor("label:Main Bot");
  await app.press("label:Main Bot");

  await app.waitFor("id:bot-tickets");
  await app.waitFor("id:bot-ticket-t1");
  await app.waitFor("id:bot-ticket-t2");
  expect(app.texts()).toContain("Tidy the release branch");
  expect(app.texts().some((text) => text.includes("From Telegram"))).toBe(true);
});

test("a Ticket a Source opened names its Source", async () => {
  const app = await open("../../App.tsx", { ...desktop, storage: storage() });
  await app.waitFor("label:Main Bot");
  await app.press("label:Main Bot");
  await app.press("id:bot-ticket-t2");

  await app.waitFor("id:ticket-board");
  expect(app.texts()).toContain("From Telegram");
  expect(app.texts()).toContain("Reply on Telegram");
});

test("opening a Ticket shows its own Session and request", async () => {
  const app = await open("../../App.tsx", { ...desktop, storage: storage() });
  await app.waitFor("label:Main Bot");
  await app.press("label:Main Bot");
  await app.press("id:bot-ticket-t1");

  await app.waitFor("id:ticket-board");
  expect(app.texts()).toContain("Tidy the release branch and run its tests.");
  await app.waitFor("id:ticket-session");
});

test("answering an Attention removes it from every list", async () => {
  const pending = attention({
    id: "a1",
    ticketId: "t1",
    prompt: "Which check should run first?",
    questions: [
      question("q1", "Which check?", [
        { label: "Unit tests", description: null },
        { label: "Lint", description: null },
      ]),
    ],
  });
  const app = await open("../../App.tsx", {
    ...desktop,
    storage: storage([pending]),
  });

  await app.waitFor("id:nav-attention");
  await app.press("id:nav-attention");
  await app.waitFor("id:attention-a1");
  await app.press("id:attention-a1");

  await app.waitFor("id:ticket-attention-a1");
  await app.press("label:Unit tests");
  await app.press(t("attention.answer"));

  await app.waitUntil(() => !app.shows("id:ticket-attention-a1"));
  await app.press(t("tickets.back"));
  await app.waitUntil(() => !app.shows("id:attention-a1"));
  expect(app.shows("id:attention-a1")).toBe(false);
  const saved = JSON.parse(app.storage()[TICKETS_FIXTURE_KEY] ?? "") as {
    attentions: { status: string; answer: unknown }[];
  };
  expect(saved.attentions[0]?.status).toBe("answered");
  expect(saved.attentions[0]?.answer).toEqual({
    kind: "question",
    answers: [{ questionId: "q1", selected: ["Unit tests"] }],
  });
});

test("cancelling a live Ticket asks first, then changes its state", async () => {
  const app = await open("../../App.tsx", { ...desktop, storage: storage() });
  await app.waitFor("label:Main Bot");
  await app.press("label:Main Bot");
  await app.press("id:bot-ticket-t1");
  await app.waitFor("id:ticket-board");

  let asked: Dialog | null = null;
  app.onDialog((dialog) => {
    asked = dialog;
    return t("tickets.cancel");
  });
  await app.press("id:ticket-cancel");
  await app.waitUntil(() => asked !== null);
  const dialog = asked as Dialog | null;
  expect(dialog?.title).toBe(t("tickets.cancelTitle"));
  expect(dialog?.buttons).toContain(t("tickets.cancel"));

  await app.waitUntil(() => {
    const saved = JSON.parse(app.storage()[TICKETS_FIXTURE_KEY] ?? "") as {
      tickets: { status: string }[];
    };
    return saved.tickets[0]?.status === "cancelled";
  });
  await app.waitFor(`text:${t("tickets.status.cancelled")}`);
});
