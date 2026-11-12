/** Display model label on a reply (the Session catalog names the chip). */
export type Model = "Swift" | "Deep" | "Vision";

/** A tool call's state: queued, running, returned, or stopped before it did. */
export type ToolState = "pending" | "running" | "done" | "cancelled";

/** One tool call the Harness reported for a reply. */
export type Tool = {
  id: string;
  kind: "generic";
  state: ToolState;
  name: string;
  arguments: string;
  result?: string;
  isError?: boolean;
};

export type FileRef = { name: string; size: string };
export type Reasoning = { text: string; seconds: number; open: boolean };
export type Status = "done" | "stopped" | "error";

/**
 * One durable Dialogue message. `at` is when dsh recorded it (epoch ms);
 * day separators and the hovered time read it.
 */
export type Msg =
  | {
      kind: "user";
      id: string;
      at?: number;
      text: string;
      image?: string;
      file?: FileRef;
      waiting?: boolean;
    }
  | {
      kind: "assistant";
      id: string;
      at?: number;
      model: Model;
      script: string;
      reasoning?: Reasoning;
      tools: Tool[];
      md: string;
      status: Status;
      error?: string;
      rating?: "up" | "down";
    };
