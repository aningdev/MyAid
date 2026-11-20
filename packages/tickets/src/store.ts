/**
 * The Tickets file: one JSON document under the plugin's data root, written
 * atomically, with a monotonic revision and change notification for watchers.
 *
 * Tickets and Attentions live together so one write settles both halves of a
 * transition (answering an Attention also reopens its Ticket) without an
 * intermediate state on disk.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";

import {
  attentionSchema,
  conversationSchema,
  resumeTicketWork,
  ticketSchema,
  triggerAnswerSchema,
  triggerSchema,
  withdrawAttention,
  type Attention,
  type Conversation,
  type Ticket,
  type Trigger,
  type TriggerAnswer,
} from "./domain.ts";

/** The document version this plugin writes. */
export const TICKETS_VERSION = 2;

export const ticketsFileSchema = z.object({
  version: z.literal(TICKETS_VERSION),
  revision: z.number().int().nonnegative(),
  tickets: z.array(ticketSchema),
  attentions: z.array(attentionSchema),
  triggers: z.array(triggerSchema),
  conversations: z.array(conversationSchema),
  answers: z.array(triggerAnswerSchema),
});
export type TicketsFile = z.infer<typeof ticketsFileSchema>;

/** The in-memory document a write reads and replaces. */
export type TicketsDocument = {
  tickets: Ticket[];
  attentions: Attention[];
  triggers: Trigger[];
  conversations: Conversation[];
  answers: TriggerAnswer[];
};

/** What a read returns: the stored state without the Source registrations. */
export type TicketState = {
  revision: number;
  tickets: Ticket[];
  attentions: Attention[];
  triggers: Trigger[];
  conversations: Conversation[];
  answers: TriggerAnswer[];
};

/** A watcher is told after every successful write; it reads the snapshot itself. */
export type TicketsWatcher = () => void;

export type TicketsStoreOptions = {
  /** This plugin's own Tickets file. */
  file: string;
};

export class TicketsStore {
  private state: TicketsFile | undefined;
  private loading: Promise<void> | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly watchers = new Set<TicketsWatcher>();
  private readonly options: TicketsStoreOptions;

  constructor(options: TicketsStoreOptions) {
    this.options = options;
  }

  /** Read the file, or start empty. */
  load(): Promise<void> {
    this.loading ??= this.read();
    return this.loading;
  }

  async snapshot(): Promise<TicketState> {
    await this.load();
    return this.current();
  }

  /**
   * Apply one pure document write. Writes serialize on one tail so revision,
   * file content and watcher order cannot interleave.
   */
  write(change: (document: TicketsDocument) => TicketsDocument): Promise<TicketState> {
    const next = this.tail.then(async () => {
      await this.load();
      const state = this.currentState();
      const document = change({
        tickets: structuredClone(state.tickets),
        attentions: structuredClone(state.attentions),
        triggers: structuredClone(state.triggers),
        conversations: structuredClone(state.conversations),
        answers: structuredClone(state.answers),
      });
      const written: TicketsFile = {
        version: TICKETS_VERSION,
        revision: state.revision + 1,
        tickets: document.tickets,
        attentions: document.attentions,
        triggers: document.triggers,
        conversations: document.conversations,
        answers: document.answers,
      };
      await this.persist(written);
      this.state = written;
      this.notify();
      return this.current();
    });
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Called after every successful write; returns the unsubscribe. */
  subscribe(watcher: TicketsWatcher): () => void {
    this.watchers.add(watcher);
    return () => {
      this.watchers.delete(watcher);
    };
  }

  private currentState(): TicketsFile {
    if (this.state === undefined) throw new Error("tickets: Tickets 文件尚未加载。");
    return this.state;
  }

  private current(): TicketState {
    const { revision, tickets, attentions, triggers, conversations, answers } = this.currentState();
    return {
      revision,
      tickets,
      attentions: attentions.filter((attention) => attention.status === "pending"),
      triggers,
      conversations,
      answers,
    };
  }

  private async read(): Promise<void> {
    const own = await readOptional(this.options.file);
    if (own === null) {
      this.state = {
        version: TICKETS_VERSION,
        revision: 0,
        tickets: [],
        attentions: [],
        triggers: [],
        conversations: [],
        answers: [],
      };
      await this.persist(this.state);
      this.notify();
      return;
    }
    const parsed = parseFile(own, this.options.file);
    const recovered = recover(parsed);
    this.state = recovered;
    if (recovered.revision !== parsed.revision) {
      await this.persist(recovered);
      this.notify();
    }
  }

  private async persist(state: TicketsFile): Promise<void> {
    await mkdir(dirname(this.options.file), { recursive: true });
    const temporary = `${this.options.file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporary, this.options.file);
  }

  private notify(): void {
    for (const watcher of this.watchers) watcher();
  }
}

/**
 * A Host that stopped with a pending Attention has no process left to answer
 * it: withdraw it and reopen its Ticket instead of leaving both stuck. A
 * Ticket in `waiting` without a pending Attention gets the same treatment.
 */
function recover(file: TicketsFile): TicketsFile {
  const now = Date.now();
  let changed = false;
  const attentions = file.attentions.map((attention) => {
    if (attention.status !== "pending") return attention;
    changed = true;
    return withdrawAttention(attention, Math.max(attention.updatedAt, now));
  });
  const pending = new Set(
    attentions
      .filter((attention) => attention.status === "pending")
      .map((attention) => attention.ticketId),
  );
  const tickets = file.tickets.map((ticket) => {
    if (ticket.status !== "waiting" || pending.has(ticket.id)) return ticket;
    changed = true;
    return resumeTicketWork(ticket, Math.max(ticket.updatedAt, now));
  });
  return changed ? { ...file, revision: file.revision + 1, attentions, tickets } : file;
}

function parseFile(text: string, path: string): TicketsFile {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`tickets: Tickets 文件 ${path} 不是合法 JSON。`);
  }
  const parsed = ticketsFileSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `tickets: Tickets 文件 ${path} 无法解析：${parsed.error.issues[0]?.message ?? "未知格式"}`,
    );
  }
  return parsed.data;
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
