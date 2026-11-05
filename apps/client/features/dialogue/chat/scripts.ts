import type { Tone } from "../../../components/ui";

/** Display model label on assistant bubbles (Session catalog is separate). */
export type Model = "Swift" | "Deep" | "Vision";

export type ToolState = "pending" | "running" | "done" | "cancelled";
export type Source = { title: string; site: string; tone: Tone };
export type Tool =
  | { id: string; kind: "search"; state: ToolState; query: string; sources: Source[] }
  | {
      id: string;
      kind: "weather";
      state: ToolState;
      city: string;
      temp: number;
      condition: string;
      high: number;
      low: number;
      hours: number[];
    }
  | {
      id: string;
      kind: "code";
      state: ToolState;
      lang: string;
      code: string;
      output: string;
      ms: number;
    };

export type FileRef = { name: string; size: string };
export type Reasoning = { text: string; seconds: number; open: boolean };
export type Status = "done" | "stopped" | "error";

export type Msg =
  | { kind: "date"; id: string; label: string }
  | { kind: "user"; id: string; text: string; image?: string; file?: FileRef; waiting?: boolean }
  | {
      kind: "assistant";
      id: string;
      model: Model;
      script: string;
      reasoning?: Reasoning;
      tools: Tool[];
      md: string;
      status: Status;
      error?: string;
      rating?: "up" | "down";
    };
