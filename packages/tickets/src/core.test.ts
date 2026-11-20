import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ToolDefinition } from "@deepseek-ai/dsh-tools";
import type { ApprovalRequest } from "@deepseek-ai/dsh-user-approval";
import type { AskUserQuestionRequest } from "@deepseek-ai/dsh-user-questions";
import type { BotsRouting } from "dsh-bots";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { TicketsCore, type TicketBots } from "./core.ts";
import { sessionIdFor } from "./ids.ts";
import type { TicketSessionStart, TicketSessions } from "./sessions.ts";
import { TicketsStore } from "./store.ts";
import { OPEN_TICKET_TOOL } from "./tool.ts";
import type { TicketsSnapshot } from "./wire.ts";

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
      workspacePath: "/tmp/worker",
    },
  ],
};

class FakeBots implements TicketBots {
  owners = new Map<string, string>();
  async routing(): Promise<BotsRouting> {
    return ROUTING;
  }
  async botForSession(sessionId: string): Promise<string | null> {
    return this.owners.get(sessionId) ?? null;
  }
}

class FakeSessions implements TicketSessions {
  starts: TicketSessionStart[] = [];
  prompts: { sessionId: string; ticketId: string; text: string }[] = [];
  cancels: string[] = [];
  notices: { sessionId: string; ticketId: string; text: string }[] = [];
  failStart: Error | null = null;

  async start(target: TicketSessionStart): Promise<void> {
    if (this.failStart !== null) throw this.failStart;
    this.starts.push(target);
  }
  async prompt(sessionId: string, ticketId: string, text: string): Promise<void> {
    this.prompts.push({ sessionId, ticketId, text });
  }
  async cancel(sessionId: string): Promise<void> {
    this.cancels.push(sessionId);
  }
  async notify(sessionId: string, ticketId: string, text: string): Promise<void> {
    this.notices.push({ sessionId, ticketId, text });
  }
}

type FakeAgent = {
  agent: Agent;
  tools: ToolDefinition[];
  events: unknown[];
};

function fakeAgent(sessionId: string, preset = "bot-preset"): FakeAgent {
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

function assistantMessage(agent: FakeAgent, text: string): void {
  agent.events.push({
    type: "assistant/message",
    data: { message: { content: [{ type: "text", text }] } },
  });
}

async function makeCore(
  options: { sessions?: FakeSessions; bots?: FakeBots } = {},
): Promise<{ core: TicketsCore; sessions: FakeSessions; bots: FakeBots }> {
  const dir = await mkdtemp(join(tmpdir(), "tickets-core-"));
  roots.push(dir);
  const sessions = options.sessions ?? new FakeSessions();
  const bots = options.bots ?? new FakeBots();
  const warnings: string[] = [];
  const core = new TicketsCore({
    store: new TicketsStore({ file: join(dir, "tickets.json") }),
    bots,
    sessions,
    logger: { warn: (message) => warnings.push(message) },
  });
  return { core, sessions, bots };
}

/** Let every settled microtask and the store's write queue drain. */
async function settle(): Promise<void> {
  for (let round = 0; round < 20; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const ORIGIN = { kind: "main-bot" as const, sessionId: "s-main" };

describe("开 Ticket", () => {
  test("按目标 Bot 的 preset 建独立 Session，并投递请求", async () => {
    const { core, sessions } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理日志",
      request: "把昨天的日志按错误码归类。",
      origin: ORIGIN,
    });
    expect(ticket.status).toBe("open");
    expect(ticket.botId).toBe("bot-worker");
    expect(ticket.sessionId).toBe(sessionIdFor(ticket.id));
    expect(sessions.starts).toEqual([
      {
        sessionId: sessionIdFor(ticket.id),
        cwd: "/tmp/worker",
        agentPreset: "bots-worker-preset",
        title: "整理日志",
      },
    ]);
    expect(sessions.prompts[0]?.text).toBe("把昨天的日志按错误码归类。");
    const snapshot = await core.snapshot();
    expect(snapshot.tickets).toHaveLength(1);
  });

  test("显式 workspacePath 覆盖 Bot 的默认目录", async () => {
    const { core, sessions } = await makeCore();
    await core.open({
      bot: "bot-worker",
      title: "整理",
      request: "做。",
      workspacePath: "/tmp/elsewhere",
      origin: ORIGIN,
    });
    expect(sessions.starts[0]?.cwd).toBe("/tmp/elsewhere");
  });

  test("找不到 Bot 时列出可用 Bot", async () => {
    const { core } = await makeCore();
    await expect(
      core.open({ bot: "nobody", title: "x", request: "y", origin: ORIGIN }),
    ).rejects.toMatchObject({ code: "tickets/not-found" });
  });

  test("缺标题或请求时拒绝", async () => {
    const { core } = await makeCore();
    await expect(
      core.open({ bot: "worker", title: " ", request: "y", origin: ORIGIN }),
    ).rejects.toMatchObject({ code: "tickets/invalid" });
  });

  test("Session 起不来时 Ticket 记为失败，并告诉 Main Bot", async () => {
    const sessions = new FakeSessions();
    sessions.failStart = new Error("preset 不存在");
    const { core } = await makeCore({ sessions });
    await expect(
      core.open({ bot: "worker", title: "整理", request: "做。", origin: ORIGIN }),
    ).rejects.toThrow("preset 不存在");
    const snapshot = await core.snapshot();
    expect(snapshot.tickets[0]?.status).toBe("failed");
    expect(sessions.notices[0]?.text).toContain("preset 不存在");
    expect(sessions.notices[0]?.sessionId).toBe("s-main");
  });
});

describe("Attention 与 Owner 介入", () => {
  test("问题 Attention 回答后 Session 拿到答案，Ticket 回到 open", async () => {
    const { core } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const agent = fakeAgent(sessionIdFor(ticket.id));
    const asking = core.askQuestion(ticket.id, {
      agent: agent.agent,
      questions: [{ id: "q1", question: "包含已恢复的错误吗？", options: [{ label: "是" }] }],
    } as AskUserQuestionRequest);
    await settle();
    const waiting = await core.snapshot();
    expect(waiting.tickets[0]?.status).toBe("waiting");
    expect(waiting.attentions).toHaveLength(1);
    const attention = waiting.attentions[0]!;
    expect(attention.kind).toBe("question");
    expect(attention.questions[0]?.question).toBe("包含已恢复的错误吗？");
    await core.answer({
      attentionId: attention.id,
      answer: { kind: "question", answers: [{ questionId: "q1", selected: ["是"] }] },
    });
    await expect(asking).resolves.toEqual({
      answers: [{ id: "q1", selected: ["是"] }],
    });
    const after = await core.snapshot();
    expect(after.tickets[0]?.status).toBe("open");
    expect(after.attentions).toEqual([]);
  });

  test("每个问题必须恰好回答一次", async () => {
    const { core } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const asking = core.askQuestion(ticket.id, {
      questions: [{ id: "q1", question: "哪一个？" }],
    } as AskUserQuestionRequest);
    await settle();
    const attention = (await core.snapshot()).attentions[0]!;
    await expect(
      core.answer({ attentionId: attention.id, answer: { kind: "question", answers: [] } }),
    ).rejects.toMatchObject({ code: "tickets/invalid" });
    await expect(
      core.answer({
        attentionId: attention.id,
        answer: {
          kind: "question",
          answers: [
            { questionId: "q1", selected: [] },
            { questionId: "q1", selected: [] },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "tickets/invalid" });
    await core.answer({
      attentionId: attention.id,
      answer: { kind: "question", answers: [{ questionId: "q1", selected: [] }] },
    });
    await asking;
  });

  test("审批 Attention：允许与拒绝都回到 Session", async () => {
    const { core } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const allow = core.askApproval(ticket.id, {
      agent: fakeAgent(sessionIdFor(ticket.id)).agent,
      toolName: "shell",
      reason: "需要写文件",
    } as ApprovalRequest);
    await settle();
    const first = (await core.snapshot()).attentions[0]!;
    expect(first.approval).toEqual({ toolName: "shell", reason: "需要写文件" });
    expect(first.prompt).toContain("shell");
    await core.answer({
      attentionId: first.id,
      answer: { kind: "approval", decision: "allow" },
    });
    await expect(allow).resolves.toBe("allowed-once");

    const reject = core.askApproval(ticket.id, {
      agent: fakeAgent(sessionIdFor(ticket.id)).agent,
      toolName: "shell",
    } as ApprovalRequest);
    await settle();
    const second = (await core.snapshot()).attentions[0]!;
    await core.answer({
      attentionId: second.id,
      answer: { kind: "approval", decision: "reject" },
    });
    await expect(reject).resolves.toBe("rejected");
  });

  test("Session 的 signal 中止时撤回 Attention，Ticket 回到 open", async () => {
    const { core } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const controller = new AbortController();
    const asking = core.askQuestion(ticket.id, {
      questions: [{ id: "q1", question: "哪一个？" }],
      signal: controller.signal,
    } as AskUserQuestionRequest);
    await settle();
    controller.abort(new Error("owner 走了"));
    await expect(asking).rejects.toThrow("owner 走了");
    const snapshot = await core.snapshot();
    expect(snapshot.tickets[0]?.status).toBe("open");
    expect(snapshot.attentions).toEqual([]);
  });

  test("回答不存在的 Attention 报 not-found", async () => {
    const { core } = await makeCore();
    await expect(
      core.answer({
        attentionId: "attention-000000000000",
        answer: { kind: "approval", decision: "allow" },
      }),
    ).rejects.toMatchObject({ code: "tickets/not-found" });
  });
});

describe("Session 结束与 Ticket 状态", () => {
  test("一轮跑完（running → idle）把 Ticket 记为 completed，并把结果写回 Main Bot", async () => {
    const { core, sessions } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const agent = fakeAgent(sessionIdFor(ticket.id));
    assistantMessage(agent, "整理完了：12 条 5xx。");
    await core.agentStatus(agent.agent, "running");
    await core.agentStatus(agent.agent, "idle");
    const snapshot = await core.snapshot();
    expect(snapshot.tickets[0]?.status).toBe("completed");
    expect(snapshot.tickets[0]?.result).toBe("整理完了：12 条 5xx。");
    expect(sessions.notices[0]).toMatchObject({ sessionId: "s-main" });
    expect(sessions.notices[0]?.text).toContain("整理完了：12 条 5xx。");
  });

  test("没经过 running 的 idle 不算完成", async () => {
    const { core, sessions } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const agent = fakeAgent(sessionIdFor(ticket.id));
    await core.agentStatus(agent.agent, "idle");
    expect((await core.snapshot()).tickets[0]?.status).toBe("open");
    expect(sessions.notices).toEqual([]);
  });

  test("等待 Owner 时 Session 空闲不结束 Ticket", async () => {
    const { core } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const agent = fakeAgent(sessionIdFor(ticket.id));
    const asking = core.askQuestion(ticket.id, {
      questions: [{ id: "q1", question: "哪一个？" }],
    } as AskUserQuestionRequest);
    await settle();
    await core.agentStatus(agent.agent, "running");
    await core.agentStatus(agent.agent, "idle");
    expect((await core.snapshot()).tickets[0]?.status).toBe("waiting");
    const attention = (await core.snapshot()).attentions[0]!;
    await core.answer({
      attentionId: attention.id,
      answer: { kind: "question", answers: [{ questionId: "q1", selected: [] }] },
    });
    await asking;
  });

  test("Session 出错把 Ticket 记为 failed", async () => {
    const { core, sessions } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const agent = fakeAgent(sessionIdFor(ticket.id));
    await core.agentError(agent.agent, new Error("模型超时"));
    const snapshot = await core.snapshot();
    expect(snapshot.tickets[0]?.status).toBe("failed");
    expect(snapshot.tickets[0]?.error).toBe("模型超时");
    expect(sessions.notices[0]?.text).toContain("模型超时");
  });

  test("Owner 在已结束的 Ticket Session 里发消息，Ticket 回到 open", async () => {
    const { core } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const agent = fakeAgent(sessionIdFor(ticket.id));
    await core.agentStatus(agent.agent, "running");
    await core.agentStatus(agent.agent, "idle");
    await core.ownerMessage(sessionIdFor(ticket.id));
    const restored = (await core.snapshot()).tickets[0]!;
    expect(restored.status).toBe("open");
    expect(restored.result).toBeNull();
  });

  test("取消会停 Session、撤回 Attention、告诉 Main Bot，且不能再取消", async () => {
    const { core, sessions } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const approval = core.askApproval(ticket.id, {
      agent: fakeAgent(sessionIdFor(ticket.id)).agent,
      toolName: "shell",
    } as ApprovalRequest);
    await settle();
    const snapshot = await core.cancel(ticket.id);
    expect(snapshot.tickets[0]?.status).toBe("cancelled");
    expect(snapshot.attentions).toEqual([]);
    expect(sessions.cancels).toEqual([sessionIdFor(ticket.id)]);
    await expect(approval).resolves.toBe("cancelled");
    expect(sessions.notices[0]?.text).toContain("被 Owner 取消");
    await expect(core.cancel(ticket.id)).rejects.toMatchObject({ code: "tickets/invalid" });
  });

  test("Session 被释放时撤回它等待的 Attention", async () => {
    const { core } = await makeCore();
    const ticket = await core.open({
      bot: "worker",
      title: "整理",
      request: "做。",
      origin: ORIGIN,
    });
    const agent = fakeAgent(sessionIdFor(ticket.id));
    const asking = core.askQuestion(ticket.id, {
      questions: [{ id: "q1", question: "哪一个？" }],
    } as AskUserQuestionRequest);
    await settle();
    await core.agentDisposed(agent.agent);
    await expect(asking).rejects.toThrow("Ticket Session 已结束。");
    expect((await core.snapshot()).attentions).toEqual([]);
  });
});

describe("Main Bot 工具", () => {
  test("挂在 Main Bot 的 Agent 上，别的 Bot 没有", async () => {
    const { core, bots } = await makeCore();
    const main = fakeAgent("s-main-prompt", "bots-main-preset");
    await expect(core.attachMainBotTool(main.agent)).resolves.toBe(true);
    expect(main.tools.map((tool) => tool.name)).toEqual([OPEN_TICKET_TOOL]);
    await core.attachMainBotTool(main.agent);
    expect(main.tools).toHaveLength(1);

    const other = fakeAgent("s-worker", "bots-worker-preset");
    bots.owners.set("s-worker", "bot-worker");
    await expect(core.attachMainBotTool(other.agent)).resolves.toBe(false);
    expect(other.tools).toEqual([]);
  });

  test("工具执行后开出一张 Ticket", async () => {
    const { core } = await makeCore();
    const main = fakeAgent("s-main-prompt", "bots-main-preset");
    await core.attachMainBotTool(main.agent);
    const tool = main.tools[0]!;
    const result = (await tool.execute({ bot: "Worker", title: "整理", task: "把日志归类。" }, {
      signal: new AbortController().signal,
      agent: main.agent,
    } as never)) as { ticketId: string; status: string; bot: string };
    expect(result.status).toBe("open");
    expect(result.bot).toBe("Worker");
    const snapshot = await core.snapshot();
    expect(snapshot.tickets[0]?.id).toBe(result.ticketId);
    expect(snapshot.tickets[0]?.origin.sessionId).toBe("s-main-prompt");
  });
});

describe("watch", () => {
  test("订阅先拿到当前快照，写入后再拿一次，abort 结束", async () => {
    const { core } = await makeCore();
    const controller = new AbortController();
    const snapshots: TicketsSnapshot[] = [];
    const reading = (async () => {
      for await (const snapshot of core.watch(controller.signal)) {
        snapshots.push(snapshot);
        if (snapshots.length === 2) controller.abort();
      }
    })();
    await settle();
    await core.open({ bot: "worker", title: "整理", request: "做。", origin: ORIGIN });
    await reading;
    expect(snapshots[0]?.revision).toBe(0);
    expect(snapshots[1]?.revision).toBe(1);
    expect(snapshots[1]?.tickets).toHaveLength(1);
  });
});
