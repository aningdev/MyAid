import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vite-plus/test";

import { createAttention, createTicket, raiseTicket, withdrawAttention } from "./domain.ts";
import { TICKETS_VERSION, TicketsStore } from "./store.ts";

const roots: string[] = [];

async function scratch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tickets-store-"));
  roots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const NOW = 1_700_000_000_000;

function document() {
  const ticket = {
    ...createTicket(
      {
        id: "ticket-aaaaaaaaaaaa",
        botId: "bot-worker",
        title: "整理日志",
        request: "归类。",
        origin: { kind: "main-bot" as const, sessionId: "s-main" },
        sessionId: "ticket-session-aaaaaaaaaaaa",
        workspacePath: null,
      },
      NOW,
    ),
  };
  return {
    ticket,
    attention: createAttention(
      {
        id: "attention-bbbbbbbbbbbb",
        ticketId: ticket.id,
        kind: "approval" as const,
        prompt: "允许 shell 执行吗？",
        questions: [],
        approval: { toolName: "shell", reason: null },
      },
      NOW,
    ),
  };
}

describe("TicketsStore", () => {
  test("首次加载建空文件，revision 为 0", async () => {
    const file = join(await scratch(), "tickets", "tickets.json");
    const store = new TicketsStore({ file });
    await store.load();
    expect(await store.snapshot()).toEqual({ revision: 0, tickets: [], attentions: [] });
    const written = JSON.parse(await readFile(file, "utf8"));
    expect(written.version).toBe(TICKETS_VERSION);
  });

  test("写入递增 revision、落盘并通知订阅者", async () => {
    const dir = await scratch();
    const file = join(dir, "tickets.json");
    const store = new TicketsStore({ file });
    await store.load();
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });
    const { ticket, attention } = document();
    const first = await store.write((doc) => ({
      ...doc,
      tickets: [...doc.tickets, ticket],
      attentions: [...doc.attentions, withdrawAttention(attention, NOW)],
    }));
    expect(first.revision).toBe(1);
    expect(notified).toBe(1);
    const reloaded = new TicketsStore({ file });
    await reloaded.load();
    const snapshot = await reloaded.snapshot();
    expect(snapshot.tickets.map((item) => item.id)).toEqual([ticket.id]);
    // A pending Attention is withdrawn on the next start: its waiter is gone.
    expect(snapshot.attentions).toEqual([]);
    unsubscribe();
    await store.write((doc) => ({ ...doc, tickets: [] }));
    expect(notified).toBe(1);
  });

  test("快照只带 pending 的 Attention", async () => {
    const file = join(await scratch(), "tickets.json");
    const store = new TicketsStore({ file });
    const { ticket, attention } = document();
    await store.write((doc) => ({
      ...doc,
      tickets: [ticket],
      attentions: [
        { ...attention, status: "answered" },
        { ...attention, id: "attention-cccccccccccc" },
      ],
    }));
    const snapshot = await store.snapshot();
    expect(snapshot.attentions.map((item) => item.id)).toEqual(["attention-cccccccccccc"]);
  });

  test("并发写入串行，revision 连续", async () => {
    const file = join(await scratch(), "tickets.json");
    const store = new TicketsStore({ file });
    await store.load();
    const revisions = await Promise.all(
      [1, 2, 3].map(() => store.write((doc) => ({ ...doc, tickets: doc.tickets }))),
    );
    expect(revisions.map((item) => item.revision).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  test("重启后撤回遗留的 pending Attention，并把 waiting 的 Ticket 放回 open", async () => {
    const file = join(await scratch(), "tickets.json");
    const store = new TicketsStore({ file });
    const { ticket, attention } = document();
    await store.write((doc) => ({
      ...doc,
      tickets: [raiseTicket(ticket, NOW + 1)],
      attentions: [attention],
    }));
    const reloaded = new TicketsStore({ file });
    await reloaded.load();
    const snapshot = await reloaded.snapshot();
    expect(snapshot.tickets[0]?.status).toBe("open");
    expect(snapshot.attentions).toEqual([]);
    const onDisk = JSON.parse(await readFile(file, "utf8"));
    expect(onDisk.attentions[0].status).toBe("withdrawn");
    expect(onDisk.revision).toBe(2);
  });

  test("坏文件给出可读错误", async () => {
    const dir = await scratch();
    await mkdir(dir, { recursive: true });
    const file = join(dir, "tickets.json");
    await writeFile(file, "{ 不是 json", "utf8");
    const store = new TicketsStore({ file });
    await expect(store.load()).rejects.toThrow(/tickets\.json/);
  });
});
