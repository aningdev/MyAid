/**
 * Project official Session follow frames onto Dialogue `Msg` values.
 * Only human-sourced `user/message` events become user bubbles.
 */
import type { Msg, Status, Tool } from "../chat/scripts";

type Event = {
  seq: number;
  type: string;
  data: Record<string, unknown>;
  surfaceOp?: unknown;
};

type GenericTool = Extract<Tool, { kind: "generic" }>;

type ParsedContent = {
  text: string;
  reasoning: string;
  tools: GenericTool[];
};

type LiveAcc = {
  text: string;
  reason: string;
  tools: Map<string, GenericTool>;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function textBlocks(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const block = object(item);
      return block.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .join("");
}

function parseContent(value: unknown): ParsedContent {
  if (typeof value === "string") return { text: value, reasoning: "", tools: [] };
  if (!Array.isArray(value)) return { text: "", reasoning: "", tools: [] };
  let text = "";
  let reasoning = "";
  const tools: GenericTool[] = [];
  for (const item of value) {
    const block = object(item);
    if (block.type === "text" && typeof block.text === "string") text += block.text;
    else if (block.type === "reasoning" && typeof block.text === "string") reasoning += block.text;
    else if (block.type === "tool-call" && typeof block.id === "string") {
      tools.push({
        id: block.id,
        kind: "generic",
        state: "pending",
        name: typeof block.name === "string" ? block.name : "tool",
        arguments: typeof block.arguments === "string" ? block.arguments : "",
      });
    }
  }
  return { text, reasoning, tools };
}

function applyStreamRecords(records: unknown, into: LiveAcc): void {
  if (!Array.isArray(records)) return;
  for (const item of records) {
    const record = object(item);
    if (record.type === "text-chunks" && Array.isArray(record.texts)) {
      into.text += record.texts.filter((part) => typeof part === "string").join("");
      continue;
    }
    if (record.type === "reasoning-chunks" && Array.isArray(record.texts)) {
      into.reason += record.texts.filter((part) => typeof part === "string").join("");
      continue;
    }
    if (record.type === "tool-call-chunks") {
      const id = typeof record.id === "string" ? record.id : "";
      if (!id) continue;
      const prev = into.tools.get(id);
      const args = Array.isArray(record.args)
        ? record.args.filter((part) => typeof part === "string").join("")
        : "";
      into.tools.set(id, {
        id,
        kind: "generic",
        state: prev?.state ?? "pending",
        name: typeof record.name === "string" ? record.name : (prev?.name ?? "tool"),
        arguments: (prev?.arguments ?? "") + args,
        result: prev?.result,
        isError: prev?.isError,
      });
      continue;
    }
    applyStreamChunk(object(record.chunk), into);
  }
}

function applyStreamChunk(chunk: Record<string, unknown>, into: LiveAcc): void {
  if (chunk.type === "text-delta" && typeof chunk.text === "string") {
    into.text += chunk.text;
    return;
  }
  if (chunk.type === "reasoning-delta" && typeof chunk.text === "string") {
    into.reason += chunk.text;
    return;
  }
  if (chunk.type === "tool-call-delta" && typeof chunk.id === "string") {
    const prev = into.tools.get(chunk.id);
    into.tools.set(chunk.id, {
      id: chunk.id,
      kind: "generic",
      state: prev?.state ?? "pending",
      name: typeof chunk.name === "string" ? chunk.name : (prev?.name ?? "tool"),
      arguments:
        (prev?.arguments ?? "") +
        (typeof chunk.argumentsDelta === "string" ? chunk.argumentsDelta : ""),
      result: prev?.result,
      isError: prev?.isError,
    });
    return;
  }
  if (chunk.type !== "block-end") return;
  const block = object(chunk.block);
  if (block.type === "tool-call" && typeof block.id === "string") {
    const prev = into.tools.get(block.id);
    into.tools.set(block.id, {
      id: block.id,
      kind: "generic",
      state: prev?.state === "done" ? "done" : "pending",
      name: typeof block.name === "string" ? block.name : (prev?.name ?? "tool"),
      arguments: typeof block.arguments === "string" ? block.arguments : (prev?.arguments ?? ""),
      result: prev?.result,
      isError: prev?.isError,
    });
  } else if (block.type === "reasoning" && typeof block.text === "string" && !into.reason) {
    into.reason = block.text;
  } else if (block.type === "text" && typeof block.text === "string" && !into.text) {
    into.text = block.text;
  }
}

function fromUser(data: Record<string, unknown>): boolean {
  const source = object(data.source);
  return typeof source.kind === "string" ? source.kind === "user" : true;
}

function withResult(tool: GenericTool, result: GenericTool | undefined): GenericTool {
  if (!result) return tool;
  return {
    ...tool,
    state: result.state,
    result: result.result,
    isError: result.isError,
  };
}

export type ProjectedChat = {
  messages: Msg[];
  running: boolean;
  status: string;
  liveMd: string;
  liveReason: string;
  liveTools: Tool[];
};

/** Disposable view of Harness history projected to Dialogue messages. */
export class SessionProjector {
  private events: Event[] = [];
  private live = "";
  private liveReasonText = "";
  private liveToolMap = new Map<string, GenericTool>();
  /** Results keyed by toolCallId, applied when building history + live. */
  private toolResults = new Map<string, GenericTool>();
  private attempt: string | undefined;
  running = false;
  status = "";

  receive(value: unknown): ProjectedChat {
    const frame = object(value);
    if (frame.type === "error") throw new Error(String(frame.error));
    if (frame.type === "snapshot") {
      this.events = [];
      this.running = false;
      this.status = "";
      this.toolResults.clear();
      this.resetLive();
      for (const record of Array.isArray(frame.records) ? frame.records : []) {
        const entry = object(record);
        // SessionHistoryRecord is `{ type: "event", event }`; accept a bare wire event too.
        this.event(entry.event ?? entry);
      }
      const attempt = object(object(frame.assistantStream).activeAttempt);
      this.attempt = typeof attempt.attemptId === "string" ? attempt.attemptId : undefined;
      this.resetLive();
      const live: LiveAcc = { text: "", reason: "", tools: this.liveToolMap };
      applyStreamRecords(attempt.stream, live);
      this.live = live.text;
      this.liveReasonText = live.reason;
      this.running = this.running || !!this.attempt;
    } else if (frame.type === "event") {
      this.event(frame.event);
    } else if (typeof frame.seq === "number" && typeof frame.type === "string") {
      // Bare SessionWireEvent (defensive — follow normally wraps as SessionEventEntry).
      this.event(frame);
    } else if (frame.type === "assistant-stream") {
      const next = object(frame.frame);
      if (next.type === "start") {
        this.attempt = String(next.attemptId);
        this.resetLive();
        this.running = true;
      }
      if (next.attemptId === this.attempt || next.attemptId === undefined) {
        const live: LiveAcc = {
          text: this.live,
          reason: this.liveReasonText,
          tools: this.liveToolMap,
        };
        if (next.type === "chunk") {
          applyStreamChunk(object(next.chunk), live);
        } else if (next.type === "text-chunks" && Array.isArray(next.texts)) {
          live.text += next.texts.filter((part) => typeof part === "string").join("");
        } else if (next.type === "reasoning-chunks" && Array.isArray(next.texts)) {
          live.reason += next.texts.filter((part) => typeof part === "string").join("");
        } else if (next.type === "tool-call-chunks") {
          applyStreamRecords([next], live);
        } else if (typeof next.text === "string" && next.type === "text-delta") {
          live.text += next.text;
        } else if (typeof next.text === "string" && next.type === "reasoning-delta") {
          live.reason += next.text;
        }
        this.live = live.text;
        this.liveReasonText = live.reason;
      }
      if (next.type === "end" && next.attemptId === this.attempt) {
        // Keep live text until assistant/message lands; clearing here races freeze.
        this.attempt = undefined;
      }
    }
    return this.snapshot();
  }

  snapshot(): ProjectedChat {
    const messages: Msg[] = [];
    for (const event of this.events) {
      if (event.type === "user/message" && fromUser(event.data)) {
        messages.push({
          kind: "user",
          id: `u${event.seq}`,
          text: textBlocks(event.data.content),
        });
      }
      if (event.type === "assistant/message") {
        const parsed = parseContent(object(event.data.message).content);
        const tools = parsed.tools.map((tool) => withResult(tool, this.toolResults.get(tool.id)));
        const status: Status =
          this.status.includes("失败") || this.status.includes("中断") ? "error" : "done";
        messages.push({
          kind: "assistant",
          id: `a${event.seq}`,
          model: "Deep",
          script: "dsh",
          reasoning: parsed.reasoning
            ? { text: parsed.reasoning, seconds: 1, open: false }
            : undefined,
          tools,
          md: parsed.text,
          status,
          error: status === "error" ? this.status || undefined : undefined,
        });
      }
    }

    const liveTools = [...this.liveToolMap.values()].map((tool) =>
      withResult(tool, this.toolResults.get(tool.id)),
    );

    return {
      messages: messages.filter(
        (m) =>
          (m.kind === "user" && m.text.length > 0) ||
          (m.kind === "assistant" && (m.md.length > 0 || m.tools.length > 0 || !!m.reasoning)),
      ),
      running: this.running,
      status: this.status,
      liveMd: this.live,
      liveReason: this.liveReasonText,
      liveTools,
    };
  }

  private resetLive(): void {
    this.live = "";
    this.liveReasonText = "";
    this.liveToolMap = new Map();
  }

  private event(value: unknown): void {
    const e = object(value);
    if (typeof e.seq !== "number" || typeof e.type !== "string") return;
    const event: Event = {
      seq: e.seq,
      type: e.type,
      data: object(e.data),
      surfaceOp: e.surfaceOp,
    };
    const op = object(event.surfaceOp);
    if (op.op === "replace" && typeof op.startSeq === "number" && typeof op.endSeq === "number") {
      const start = op.startSeq;
      const end = op.endSeq;
      this.events = this.events.filter((item) => item.seq < start || item.seq > end);
    }
    if (!this.events.some((item) => item.seq === event.seq)) this.events.push(event);

    if (event.type === "turn/start") {
      this.running = true;
      this.status = "";
      this.toolResults.clear();
    }
    if (event.type === "turn/end") {
      this.running = false;
      const reason = object(event.data.reason);
      this.status =
        reason.kind === "interrupted"
          ? "上次执行已中断"
          : reason.kind === "aborted"
            ? "执行已停止"
            : reason.kind === "error"
              ? `执行失败：${String(object(reason.error).message ?? "未知错误")}`
              : "";
    }
    if (event.type === "tool/call") {
      const callId = typeof event.data.callId === "string" ? event.data.callId : "";
      if (callId) {
        const prev = this.liveToolMap.get(callId);
        this.liveToolMap.set(callId, {
          id: callId,
          kind: "generic",
          state: "running",
          name: typeof event.data.name === "string" ? event.data.name : (prev?.name ?? "tool"),
          arguments:
            typeof event.data.arguments === "string"
              ? event.data.arguments
              : (prev?.arguments ?? ""),
          result: prev?.result,
          isError: prev?.isError,
        });
      }
    }
    if (event.type === "tool/result") {
      const message = object(event.data.message);
      const callId =
        typeof message.toolCallId === "string"
          ? message.toolCallId
          : typeof object(message.source).callId === "string"
            ? String(object(message.source).callId)
            : "";
      if (callId) {
        const prev = this.liveToolMap.get(callId) ?? this.toolResults.get(callId);
        const isError = message.isError === true || event.data.error != null;
        const result: GenericTool = {
          id: callId,
          kind: "generic",
          state: "done",
          name: prev?.name ?? "tool",
          arguments: prev?.arguments ?? "",
          result: textBlocks(message.content),
          isError,
        };
        this.toolResults.set(callId, result);
        if (this.liveToolMap.has(callId)) this.liveToolMap.set(callId, result);
      }
    }
    if (event.type === "assistant/message") {
      const parsed = parseContent(object(event.data.message).content);
      // Prefer durable message text so ChatPane can still read live* if freeze races.
      if (parsed.text) this.live = parsed.text;
      if (parsed.reasoning) this.liveReasonText = parsed.reasoning;
      for (const tool of parsed.tools) {
        this.liveToolMap.set(tool.id, withResult(tool, this.toolResults.get(tool.id)));
      }
    }
    if (event.data.interrupted === true) this.status = "执行已停止";
    if (event.type.includes("error") || event.type === "llm/failure") {
      this.status = "执行失败，请检查模型配置与凭据";
      this.running = false;
    }
  }
}
