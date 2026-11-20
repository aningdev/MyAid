/**
 * Unchecked Ticket and Attention fixtures for tests and harnesses. The
 * `tickets` plugin owns the write rules; these builders only fill the shape
 * the Client reads.
 */
import { TICKETS_FIXTURE_KEY, type TicketsSeed } from "../features/tickets/memory";
import type {
  Attention,
  AttentionAnswer,
  AttentionKind,
  AttentionOption,
  AttentionQuestion,
  Ticket,
  TicketStatus,
} from "../lib/dsh/tickets-gateway";

export { TICKETS_FIXTURE_KEY };

const AT = Date.parse("2026-11-20T09:00:00.000Z");

export function ticketsStorage(input: TicketsSeed): Record<string, string> {
  return { [TICKETS_FIXTURE_KEY]: JSON.stringify(input) };
}

export function ticket(input: {
  id: string;
  botId: string;
  title: string;
  request?: string;
  origin?: Ticket["origin"];
  status?: TicketStatus;
  sessionId?: string | null;
  result?: string | null;
  error?: string | null;
  createdAt?: number;
  updatedAt?: number;
}): Ticket {
  return {
    id: input.id,
    botId: input.botId,
    title: input.title,
    request: input.request ?? input.title,
    origin: input.origin ?? { kind: "main-bot", sessionId: "s-main" },
    status: input.status ?? "open",
    sessionId: input.sessionId ?? null,
    workspacePath: input.sessionId ? "/work/dsh-bot" : null,
    result: input.result ?? null,
    error: input.error ?? null,
    createdAt: input.createdAt ?? AT,
    updatedAt: input.updatedAt ?? AT,
    endedAt: input.status && input.status !== "open" && input.status !== "waiting" ? AT : null,
  };
}

export function question(
  id: string,
  wording: string,
  options: AttentionOption[] | null = null,
  multiSelect = false,
): AttentionQuestion {
  return { id, question: wording, header: null, options, multiSelect, intent: null };
}

export function attention(input: {
  id: string;
  ticketId: string;
  kind?: AttentionKind;
  prompt: string;
  questions?: AttentionQuestion[];
  toolName?: string;
  reason?: string | null;
  status?: Attention["status"];
  answer?: AttentionAnswer | null;
  createdAt?: number;
}): Attention {
  return {
    id: input.id,
    ticketId: input.ticketId,
    kind: input.kind ?? "question",
    prompt: input.prompt,
    questions: input.questions ?? [],
    approval:
      input.kind === "approval"
        ? { toolName: input.toolName ?? "bash", reason: input.reason ?? null }
        : null,
    status: input.status ?? "pending",
    answer: input.answer ?? null,
    createdAt: input.createdAt ?? AT,
    updatedAt: input.createdAt ?? AT,
  };
}
