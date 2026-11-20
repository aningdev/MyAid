import { describe, expect, test } from "vite-plus/test";

import {
  answerAttention,
  createAttention,
  createTicket,
  endTicket,
  isLiveTicket,
  raiseTicket,
  restoreTicket,
  resumeTicketWork,
  TicketError,
  withdrawAttention,
  type Attention,
  type Ticket,
} from "./domain.ts";

const NOW = 1_700_000_000_000;

function ticket(patch: Partial<Ticket> = {}): Ticket {
  return {
    ...createTicket(
      {
        id: "ticket-aaaaaaaaaaaa",
        botId: "bot-worker",
        title: "整理日志",
        request: "把昨天的日志按错误码归类。",
        origin: { kind: "main-bot", sessionId: "s-main" },
        sessionId: "ticket-session-aaaaaaaaaaaa",
        workspacePath: "/tmp/work",
      },
      NOW,
    ),
    ...patch,
  };
}

function question(patch: Partial<Attention> = {}): Attention {
  return {
    ...createAttention(
      {
        id: "attention-bbbbbbbbbbbb",
        ticketId: "ticket-aaaaaaaaaaaa",
        kind: "question",
        prompt: "要包含已恢复的错误吗？",
        questions: [
          {
            id: "q1",
            question: "要包含已恢复的错误吗？",
            header: null,
            options: null,
            multiSelect: false,
            intent: null,
          },
        ],
        approval: null,
      },
      NOW,
    ),
    ...patch,
  };
}

describe("Ticket 状态机", () => {
  test("新 Ticket 处于 open", () => {
    const created = ticket();
    expect(created.status).toBe("open");
    expect(created.result).toBeNull();
    expect(created.endedAt).toBeNull();
    expect(isLiveTicket(created)).toBe(true);
  });

  test("open → waiting → open", () => {
    const waiting = raiseTicket(ticket(), NOW + 1);
    expect(waiting.status).toBe("waiting");
    expect(waiting.updatedAt).toBe(NOW + 1);
    expect(resumeTicketWork(waiting, NOW + 2).status).toBe("open");
  });

  test("已在等待时不能再次 raise", () => {
    const waiting = raiseTicket(ticket(), NOW);
    expect(() => raiseTicket(waiting, NOW)).toThrow(TicketError);
  });

  test("不在等待时不能 resume", () => {
    expect(() => resumeTicketWork(ticket(), NOW)).toThrow(TicketError);
  });

  test("open → completed 记结果和结束时间", () => {
    const done = endTicket(ticket(), { kind: "completed", result: "已归类 12 条。" }, NOW + 3);
    expect(done.status).toBe("completed");
    expect(done.result).toBe("已归类 12 条。");
    expect(done.error).toBeNull();
    expect(done.endedAt).toBe(NOW + 3);
    expect(isLiveTicket(done)).toBe(false);
  });

  test("open → failed 记错误", () => {
    const failed = endTicket(ticket(), { kind: "failed", error: "模型超时" }, NOW);
    expect(failed.status).toBe("failed");
    expect(failed.error).toBe("模型超时");
    expect(failed.result).toBeNull();
  });

  test("取消是终态", () => {
    const cancelled = endTicket(ticket(), { kind: "cancelled" }, NOW);
    expect(cancelled.status).toBe("cancelled");
    expect(() => endTicket(cancelled, { kind: "completed", result: "x" }, NOW)).toThrow(
      TicketError,
    );
    expect(() => restoreTicket(cancelled, NOW)).toThrow(TicketError);
  });

  test("completed / failed 被新的 Owner 消息恢复为 open 并清空结局", () => {
    const done = endTicket(ticket(), { kind: "completed", result: "好的" }, NOW);
    const restored = restoreTicket(done, NOW + 9);
    expect(restored.status).toBe("open");
    expect(restored.result).toBeNull();
    expect(restored.endedAt).toBeNull();
    expect(restored.updatedAt).toBe(NOW + 9);
    const failed = endTicket(ticket(), { kind: "failed", error: "坏了" }, NOW);
    expect(restoreTicket(failed, NOW).error).toBeNull();
  });
});

describe("Attention 状态机", () => {
  test("新 Attention 是 pending", () => {
    expect(question().status).toBe("pending");
    expect(question().answer).toBeNull();
  });

  test("回答后为 answered 并带回答案", () => {
    const answered = answerAttention(
      question(),
      { kind: "question", answers: [{ questionId: "q1", selected: ["是"], custom: "只算 5xx" }] },
      NOW + 1,
    );
    expect(answered.status).toBe("answered");
    expect(answered.answer).toEqual({
      kind: "question",
      answers: [{ questionId: "q1", selected: ["是"], custom: "只算 5xx" }],
    });
  });

  test("不能回答两次", () => {
    const answered = answerAttention(
      question(),
      { kind: "question", answers: [{ questionId: "q1", selected: [] }] },
      NOW,
    );
    expect(() =>
      answerAttention(
        answered,
        { kind: "question", answers: [{ questionId: "q1", selected: [] }] },
        NOW,
      ),
    ).toThrow(TicketError);
  });

  test("不能用审批答案回答问题", () => {
    expect(() => answerAttention(question(), { kind: "approval", decision: "allow" }, NOW)).toThrow(
      TicketError,
    );
  });

  test("撤回后为 withdrawn，且不能再回答", () => {
    const withdrawn = withdrawAttention(question(), NOW + 1);
    expect(withdrawn.status).toBe("withdrawn");
    expect(() =>
      answerAttention(
        withdrawn,
        { kind: "question", answers: [{ questionId: "q1", selected: [] }] },
        NOW,
      ),
    ).toThrow(TicketError);
  });
});
