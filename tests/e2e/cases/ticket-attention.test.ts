// Spec acceptance 5 (the Ticket lifecycle) and 6: the Main Bot opens a Ticket
// for another Bot, the Ticket's Session asks the Owner, both Devices see the
// Attention, one answers, it disappears from the other, and the Ticket runs on
// to its end with the result back in the Main Bot's Session.

import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { type ConnectedDevice, connectedDevice, openSession } from "../support/device";
import type { Script } from "../support/llm";
import { officialDsh, type RealStack, startRealStack } from "../support/real-stack";
import { type Watch, watching } from "../support/watch";

/**
 * What the model says: the Main Bot delegates; the Researcher asks, then reports.
 * A Ticket Session is told apart by `ticket_report`, which only it is given.
 */
const script: Script = (turn) => {
  if (turn.tools.includes("ticket_report")) {
    if (turn.result?.tool === "ask_user_question") {
      const chosen = (JSON.parse(turn.result.output) as { answers: { selected: string[] }[] })
        .answers[0]?.selected[0];
      return {
        tool: "ticket_report",
        arguments: { status: "completed", result: `Chose plan ${chosen}` },
      };
    }
    if (turn.result?.tool === "ticket_report") return { text: "Reported." };
    return {
      tool: "ask_user_question",
      arguments: {
        questions: [
          { id: "plan", question: "Plan A or plan B?", options: [{ label: "A" }, { label: "B" }] },
        ],
      },
    };
  }
  if (turn.tools.includes("ticket_open")) {
    if (turn.result?.tool === "ticket_open") return { text: "Handed over to the Researcher." };
    if (turn.text?.includes("delegate"))
      return {
        tool: "ticket_open",
        arguments: {
          bot: "Researcher",
          title: "Compare plans",
          task: "Compare plan A and plan B.",
        },
      };
    return { text: "Noted." };
  }
  return { text: "ok" };
};

describe.skipIf(!officialDsh)("a Ticket that needs its Owner", () => {
  type Tickets = Awaited<ReturnType<ConnectedDevice["tickets"]["snapshot"]>>;
  let stack: RealStack;
  let phone: ConnectedDevice;
  let desktop: ConnectedDevice;
  let onPhone: Watch<Tickets>;
  let onDesktop: Watch<Tickets>;

  beforeAll(async () => {
    stack = await startRealStack(script);
    phone = await connectedDevice(stack, "e2e-phone");
    desktop = await connectedDevice(stack, "e2e-desktop");
    onPhone = watching((signal) => phone.tickets.watch(signal));
    onDesktop = watching((signal) => desktop.tickets.watch(signal));
  });

  afterAll(async () => {
    onPhone?.stop();
    onDesktop?.stop();
    await phone?.close();
    await desktop?.close();
    await stack?.stop();
  });

  test("the Attention reaches both Devices, one answers, and the Ticket finishes", async () => {
    await phone.bots.createBot({ id: "researcher", name: "Researcher", templateId: "standard" });
    await phone.bots.initializeBot("researcher");

    // The Owner asks the Main Bot, from the phone.
    const asked = (snapshot: Tickets): boolean =>
      snapshot.attentions.some((attention) => attention.status === "pending");
    const phoneAsked = onPhone.until(asked);
    const desktopAsked = onDesktop.until(asked);
    const { sessionId } = await phone.connection.createSession({
      cwd: stack.workspace,
      agentPreset: "standard",
    });
    const panel = await openSession(phone, sessionId);
    const prompt = await panel.session.prompt(
      [{ type: "text", text: "Please delegate the plan comparison to the Researcher." }],
      "queue",
    );
    expect(prompt.ok).toBe(true);

    // Both Devices see the same Attention, on a Ticket under the Researcher.
    const [seenOnPhone, seenOnDesktop] = await Promise.all([phoneAsked, desktopAsked]);
    const attention = seenOnDesktop.attentions.find((item) => item.status === "pending")!;
    expect(seenOnPhone.attentions.map((item) => item.id)).toEqual([attention.id]);
    expect(attention.prompt).toBe("Plan A or plan B?");
    const ticket = seenOnDesktop.tickets.find((item) => item.id === attention.ticketId)!;
    expect(ticket).toMatchObject({
      botId: "researcher",
      status: "waiting",
      origin: { kind: "main-bot", sessionId },
    });

    // The desktop answers; the phone's copy goes away and the Ticket runs on.
    const phoneCleared = onPhone.until(
      (snapshot) =>
        !snapshot.attentions.some((item) => item.id === attention.id && item.status === "pending"),
    );
    const finished = (snapshot: Tickets): boolean =>
      snapshot.tickets.some((item) => item.id === ticket.id && item.status === "completed");
    const phoneFinished = onPhone.until(finished);
    const desktopFinished = onDesktop.until(finished);
    await desktop.tickets.answer({
      attentionId: attention.id,
      answer: { kind: "question", answers: [{ questionId: "plan", selected: ["A"] }] },
    });
    await phoneCleared;
    const [endedOnPhone, endedOnDesktop] = await Promise.all([phoneFinished, desktopFinished]);
    for (const snapshot of [endedOnPhone, endedOnDesktop]) {
      expect(snapshot.tickets.find((item) => item.id === ticket.id)).toMatchObject({
        botId: "researcher",
        status: "completed",
        result: "Chose plan A",
      });
      expect(snapshot.attentions.filter((item) => item.status === "pending")).toEqual([]);
    }

    // The result came back into the Main Bot's own Session.
    const report = await stack.llm.turn(
      (turn) => turn.tools.includes("ticket_open") && turn.text?.includes("Chose plan A") === true,
    );
    expect(report.text).toContain("Chose plan A");
    panel.release();
  });
});
