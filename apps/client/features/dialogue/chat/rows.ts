/**
 * The transcript's render rows: day separators, the messages, the working
 * row. One pure function, so what the list shows (and in which order) is
 * testable without a screen; components only draw it.
 */
import type { Msg, Tool } from "./scripts";

export type Assistant = Extract<Msg, { kind: "assistant" }>;
export type User = Extract<Msg, { kind: "user" }>;
import { dayKey, dayLabel } from "./time";

/** One message's parts, in the order the Harness wrote them. */
export type AssistantPart =
  | { kind: "thinking"; text: string; seconds: number }
  | { kind: "steps"; tools: readonly Tool[] }
  | { kind: "text"; md: string };

export type Row =
  | { kind: "date"; id: string; label: string }
  | { kind: "user"; id: string; message: User }
  | { kind: "assistant"; id: string; message: Assistant; streaming: boolean }
  | { kind: "working"; id: string; since: number };

export type RowInput = {
  messages: readonly Msg[];
  /** The reply being written (it is in `messages`); its row streams. */
  liveId: string | null;
  /** The Agent runs: a working row ends the list. */
  running: boolean;
  /** When the running turn began, for that row's elapsed time. */
  since: number | null;
  /** "Today" is read against this instant. */
  now: number;
};

/** What the transcript shows, top to bottom. */
export function buildRows(input: RowInput): Row[] {
  const rows: Row[] = [];
  let lastDay = "";
  for (const message of input.messages) {
    const at = message.at;
    if (at !== undefined) {
      const key = dayKey(at);
      if (key !== lastDay) {
        rows.push({ kind: "date", id: `date-${key}`, label: dayLabel(at, input.now) });
        lastDay = key;
      }
    }
    if (message.kind === "user") {
      rows.push({ kind: "user", id: message.id, message });
    } else {
      rows.push({
        kind: "assistant",
        id: message.id,
        message,
        streaming: message.id === input.liveId,
      });
    }
  }
  if (input.running && input.since !== null) {
    rows.push({ kind: "working", id: "working", since: input.since });
  }
  return rows;
}

/** A reply's parts: what it thought, the calls it made, the words it wrote. */
export function assistantParts(message: Assistant, streaming = false): AssistantPart[] {
  const parts: AssistantPart[] = [];
  if (message.reasoning?.text) {
    parts.push({
      kind: "thinking",
      text: message.reasoning.text,
      seconds: message.reasoning.seconds,
    });
  }
  if (message.tools.length > 0) parts.push({ kind: "steps", tools: message.tools });
  if (message.md || !streaming) parts.push({ kind: "text", md: message.md });
  return parts;
}

/** Consecutive calls read as one row while there are several. */
export function groupsSteps(tools: readonly Tool[]): boolean {
  return tools.length > 1;
}

/** "1 step", "4 steps". */
export function stepsLabel(tools: readonly Tool[]): string {
  return `${tools.length} ${tools.length === 1 ? "step" : "steps"}`;
}

/**
 * What a call row says: the tool's name, and what it is working on. The
 * arguments are JSON when dsh sends them so; the first useful string in
 * them is the target beside the verb.
 */
export function toolSummary(tool: Tool): { verb: string; target: string } {
  const verb = tool.name || "Tool";
  return { verb, target: firstArgument(tool.arguments) };
}

function firstArgument(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  try {
    const parsed: unknown = JSON.parse(text);
    const found = findString(parsed, 0);
    if (found) return oneLine(found);
  } catch {
    // Arguments still streaming or not JSON: show them as written.
  }
  return oneLine(text);
}

function findString(value: unknown, depth: number): string | null {
  if (depth > 3) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const found = findString(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function oneLine(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

/** A tool row's state, as the row shows it: failed and cut off included. */
export type ToolDisplayState = "pending" | "running" | "done" | "failed" | "cut";

export function toolDisplayState(tool: Tool): ToolDisplayState {
  if (tool.state === "cancelled") return "cut";
  if (tool.state === "pending") return "pending";
  if (tool.state === "running") return "running";
  return tool.isError ? "failed" : "done";
}

/** The expansion set with one key flipped; a new set, so readers re-render. */
export function toggleKey(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set);
  if (!next.delete(key)) next.add(key);
  return next;
}
