// The model provider behind the real dsh: the package's own mock server
// (`@deepseek-ai/dsh-llm-mock-server`) for the wire, and a script that decides
// what the model says. The mock consumes a fixed sequence whatever the request
// is and can emit one tool call; a case needs the answer to depend on who asks
// and what came before, so each distinct step gets its own mock instance and
// this router picks the instance from the request.

import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

import { type MockLlmServer, startMockLlmServer } from "@deepseek-ai/dsh-llm-mock-server";

/** What the model answers: some text, or one tool call. */
export type Step = { text: string } | { tool: string; arguments: unknown };

/** A Messages request body, reduced to what a script reads. */
export interface Turn {
  /** The tools the Agent offers, by name. */
  readonly tools: readonly string[];
  /** The text of the last user message, when the last message is plain text. */
  readonly text: string | null;
  /** The last message is the result of this tool, with this output. */
  readonly result: { tool: string; output: string } | null;
}

export type Script = (turn: Turn) => Step;

export const key = "mock-key";

interface Block {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  tool_use_id?: string;
  content?: unknown;
}
interface Message {
  role: string;
  content: string | Block[];
}

function blocks(message: Message): Block[] {
  return typeof message.content === "string"
    ? [{ type: "text", text: message.content }]
    : message.content;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return (content as Block[]).map((block) => block.text ?? "").join("");
}

/** Reads the one request body a script decides on. */
export function turnOf(body: unknown): Turn {
  const request = body as { tools?: { name: string }[]; messages?: Message[] };
  const messages = request.messages ?? [];
  const last = messages.at(-1);
  const tools = (request.tools ?? []).map((tool) => tool.name);
  if (!last) return { tools, text: null, result: null };
  const lastBlocks = blocks(last);
  const answered = lastBlocks.find((block) => block.type === "tool_result");
  if (answered) {
    const call = messages
      .flatMap(blocks)
      .find((block) => block.type === "tool_use" && block.id === answered.tool_use_id);
    return {
      tools,
      text: null,
      result: { tool: call?.name ?? "", output: textOf(answered.content) },
    };
  }
  const text = lastBlocks
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");
  return { tools, text: last.role === "user" ? text : null, result: null };
}

export interface Llm {
  /** The `DEEPSEEK_BASE_URL` the real dsh is pointed at. */
  readonly baseUrl: string;
  /** Every request that reached the provider, in arrival order. */
  readonly turns: readonly Turn[];
  /** Resolves with the first turn, seen so far or yet to come, that `match` accepts. */
  turn(match: (turn: Turn) => boolean): Promise<Turn>;
  stop(): Promise<void>;
}

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function startLlm(script: Script): Promise<Llm> {
  const instances = new Map<string, Promise<MockLlmServer>>();
  const instance = (step: Step): Promise<MockLlmServer> => {
    const id = JSON.stringify(step);
    let started = instances.get(id);
    if (!started) {
      started = startMockLlmServer({
        apiKey: key,
        sequence: ["tool" in step ? "tool_call_success" : "success"],
        repeatLast: true,
        chunkDelayMs: 0,
        chunkSize: 4096,
        ...("tool" in step
          ? { toolName: step.tool, toolArguments: JSON.stringify(step.arguments) }
          : { successText: step.text }),
      });
      instances.set(id, started);
    }
    return started;
  };

  const turns: Turn[] = [];
  const waiting = new Set<() => void>();
  let calls = 0;
  const server = createServer((request, response) => {
    void (async () => {
      const text = await body(request);
      const parsed = JSON.parse(text) as unknown;
      const turn = turnOf(parsed);
      turns.push(turn);
      for (const wake of waiting) wake();
      const target = await instance(script(turn));
      const forwarded = await fetch(new URL(request.url ?? "/", target.baseURL), {
        method: request.method,
        headers: {
          "content-type": "application/json",
          "x-api-key": String(request.headers["x-api-key"] ?? ""),
        },
        body: text,
      });
      const headers = Object.fromEntries(forwarded.headers);
      delete headers["content-length"];
      response.writeHead(forwarded.status, headers);
      // The mock names every tool call the same; dsh keys results by that id.
      calls += 1;
      const stream = (await forwarded.text()).replaceAll("mock-call-1", `mock-call-${calls}`);
      response.end(stream);
    })().catch((error: unknown) => {
      response.writeHead(500).end(String(error));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    turns,
    turn: (match) =>
      new Promise((resolve) => {
        const look = (): boolean => {
          const found = turns.find(match);
          if (found) resolve(found);
          return found !== undefined;
        };
        if (look()) return;
        const check = (): void => {
          if (look()) waiting.delete(check);
        };
        waiting.add(check);
      }),
    async stop() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      for (const started of instances.values()) await (await started).close();
    },
  };
}
