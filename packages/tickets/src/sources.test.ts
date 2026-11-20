/**
 * The Source seam end to end, against a fake Source and fake Sessions:
 * Owner Trigger → one confirmation → Ticket → result back in the same thread.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { BotsRouting } from "dsh-bots";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { TicketsCore, type TicketBots } from "./core.ts";
import { sessionIdFor } from "./ids.ts";
import type { TicketSessionStart, TicketSessions } from "./sessions.ts";
import { TicketsStore } from "./store.ts";
import { FakeSource } from "./testing/fake-source.ts";
import { OPEN_TICKET_TOOL, REPORT_TICKET_TOOL } from "./tool.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const ROUTING: BotsRouting = {
  mainBot: { id: "bots-main", name: "Main Bot", presetId: "bots-main-preset" },
  bots: [
    {
      id: "bots-main",
      name: "Main Bot",
      description: null,
      presetId: "bots-main-preset",
      defaultModel: null,
      defaultThinking: null,
      workspacePath: null,
    },
    {
      id: "bot-worker",
      name: "Worker",
      description: "整理资料",
      presetId: "bots-worker-preset",
      defaultModel: null,
      defaultThinking: null,
      workspacePath: null,
    },
  ],
};

class FakeBots implements TicketBots {
  async routing(): Promise<BotsRouting> {
    return ROUTING;
  }
  async botForSession(): Promise<string | null> {
    return null;
  }
}

class FakeSessions implements TicketSessions {
  starts: TicketSessionStart[] = [];
  prompts: string[] = [];
  triggers: string[] = [];
  parents = new Map<string, string>();
  failStart: Error | null = null;

  async start(target: TicketSessionStart): Promise<void> {
    if (this.failStart !== null) throw this.failStart;
    this.starts.push(target);
  }
  async prompt(_sessionId: string, _ticketId: string, text: string): Promise<void> {
    this.prompts.push(text);
  }
  async cancel(): Promise<void> {}
  async notify(): Promise<void> {}
  async trigger(_sessionId: string, _trigger: { triggerId: string; source: string }, text: string) {
    this.triggers.push(text);
  }
  async parentSession(sessionId: string): Promise<string | null> {
    return this.parents.get(sessionId) ?? null;
  }
}

const OWNER = { id: "owner-1", name: "阿元" };
const COLLEAGUE = { id: "colleague-2", name: "小李" };

async function makeCore(): Promise<{
  core: TicketsCore;
  sessions: FakeSessions;
  source: FakeSource;
}> {
  const dir = await mkdtemp(join(tmpdir(), "tickets-sources-"));
  roots.push(dir);
  const sessions = new FakeSessions();
  const source = new FakeSource();
  const core = new TicketsCore({
    store: new TicketsStore({ file: join(dir, "tickets.json") }),
    bots: new FakeBots(),
    sessions,
    sources: source.registry,
    logger: { warn: () => undefined },
  });
  return { core, sessions, source };
}

function fakeAgent(sessionId: string, preset = "bots-main-preset") {
  const tools: ToolDefinition[] = [];
  const events: unknown[] = [];
  const agent = {
    id: sessionId,
    session: {
      header: { agentPreset: preset },
      snapshotEvents: () => events,
    },
    ctx: {
      tools: {
        register: (definition: ToolDefinition) => {
          tools.push(definition);
          return () => undefined;
        },
      },
    },
  };
  return { agent: agent as unknown as Agent, tools, events };
}

function deliver(
  core: TicketsCore,
  source: FakeSource,
  overrides: { id?: string; human?: { id: string; name: string }; text?: string } = {},
) {
  return core.deliver(source.instanceId, {
    id: overrides.id ?? "trigger-1",
    thread: "pr-review",
    address: "pr-review#42",
    at: "2026-11-20T09:00:00Z",
    human: overrides.human ?? OWNER,
    text: overrides.text ?? "@bot 总结今天的 PR",
  });
}

describe("Source → Trigger → Channel", () => {
  test("Owner 的 Trigger 得到一次确认，Ticket 的结果回到同一个对话", async () => {
    const { core, sessions, source } = await makeCore();
    const delivered = await deliver(core, source);
    expect(delivered.status).toBe("accepted");

    const conversation = (await core.snapshot()).conversations[0]!;
    expect(conversation.source).toBe(source.instanceId);
    expect(conversation.thread).toBe("pr-review");
    expect(sessions.starts[0]).toMatchObject({
      sessionId: conversation.sessionId,
      agentPreset: "bots-main-preset",
    });
    expect(sessions.triggers[0]).toContain("@bot 总结今天的 PR");

    const main = fakeAgent(conversation.sessionId);
    await core.attachMainBotTool(main.agent);
    const open = main.tools.find((tool) => tool.name === OPEN_TICKET_TOOL)!;
    const opened = (await open.execute(
      { bot: "Worker", title: "总结今天的 PR", task: "总结 #42 的评论。" },
      { signal: new AbortController().signal, agent: main.agent } as never,
    )) as { ticketId: string; status: string };

    expect(opened.status).toBe("open");
    const ticket = (await core.snapshot()).tickets[0]!;
    expect(ticket.origin).toEqual({
      kind: "source",
      source: source.instanceId,
      sourceKind: "fake",
      triggerId: "trigger-1",
      thread: "pr-review",
      address: "pr-review#42",
    });
    // Exactly one confirmation, back in the same address.
    expect(source.sent).toHaveLength(1);
    expect(source.sent[0]?.address).toBe("pr-review#42");
    expect(source.sent[0]?.text).toContain("已收到");

    const worker = fakeAgent(sessionIdFor(ticket.id), "bots-worker-preset");
    await core.attachTicketTool(worker.agent);
    const report = worker.tools.find((tool) => tool.name === REPORT_TICKET_TOOL)!;
    await report.execute({ status: "completed", result: "PR #42 有 3 个待办，2 个已解决。" }, {
      signal: new AbortController().signal,
      agent: worker.agent,
    } as never);

    expect(source.sent).toHaveLength(2);
    expect(source.sent[1]?.address).toBe("pr-review#42");
    expect(source.sent[1]?.text).toContain("PR #42 有 3 个待办");
    expect((await core.snapshot()).tickets[0]?.status).toBe("completed");
    // The Main Bot's own Session got no second report; the Channel got it.
    expect(sessions.triggers).toHaveLength(1);
  });

  test("同事发同样的内容：不建 Session、不开 Ticket、不写 Channel", async () => {
    const { core, sessions, source } = await makeCore();
    const delivered = await deliver(core, source, { human: COLLEAGUE });
    expect(delivered.status).toBe("ignored");
    expect(sessions.starts).toEqual([]);
    expect(sessions.triggers).toEqual([]);
    expect(source.sent).toEqual([]);
    const snapshot = await core.snapshot();
    expect(snapshot.triggers).toHaveLength(1);
    expect(snapshot.triggers[0]?.disposition).toBe("ignored");
    expect(snapshot.tickets).toEqual([]);
  });

  test("同一个 Trigger 再送一次是 duplicate，不重复开 Session", async () => {
    const { core, sessions, source } = await makeCore();
    await deliver(core, source);
    const again = await deliver(core, source);
    expect(again.status).toBe("duplicate");
    expect(sessions.starts).toHaveLength(1);
    expect((await core.snapshot()).triggers).toHaveLength(1);
  });

  test("Main Bot 不开 Ticket、直接回答时，回答写回同一个对话且只写一次", async () => {
    const { core, sessions, source } = await makeCore();
    await deliver(core, source);
    const conversation = (await core.snapshot()).conversations[0]!;
    const main = fakeAgent(conversation.sessionId);
    main.events.push({
      type: "assistant/message",
      data: { message: { content: [{ type: "text", text: "今天的 PR 都看完了。" }] } },
    });
    await core.agentStatus(main.agent, "idle");
    expect(source.sent).toHaveLength(1);
    expect(source.sent[0]?.text).toContain("今天的 PR 都看完了。");
    await core.agentStatus(main.agent, "idle");
    expect(source.sent).toHaveLength(1);
    expect((await core.snapshot()).tickets).toEqual([]);
    expect(sessions.triggers).toHaveLength(1);
  });

  test("未注册的 Source 拒绝投递", async () => {
    const { core } = await makeCore();
    await expect(
      core.deliver("source-nobody", {
        id: "trigger-9",
        thread: "t",
        address: "a",
        text: "hi",
      }),
    ).rejects.toMatchObject({ code: "tickets/not-found" });
  });
});
