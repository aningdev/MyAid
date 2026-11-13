/**
 * What Bot details reads beyond the Pane's own Session view: context
 * occupancy and token totals (`session.projections`), the Compact command
 * (`commands.execute`), whether the Host can reveal a path, and the files the
 * Session's turns declared. One read per Session, refreshed when a turn ends,
 * after Compact, or when the section is opened; nothing is polled.
 *
 * The Host reads sit behind `SessionFactsSource`: one seam the product fills
 * from the shared Connection, and `nsh test` substitutes (the same shape as
 * Bot details' `botFactsSource`).
 */
import { signal, untracked } from "nsh";

import { readableError, type CommandOutcome, type SessionUsage } from "../../lib/dsh/connection";
import { controllerFor, sessionTransport } from "../dialogue/session/runtime";
import type { Deliverable } from "../dialogue/session/turn";

export type UsageRead =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; usage: SessionUsage }
  | { status: "failed"; error: string };

export type CompactRead =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; text: string }
  | { status: "failed"; error: string };

/** Everything Bot details reads from the Host or the Session view. */
export type SessionFactsSource = {
  /** Context occupancy and token totals (empty when the deployment has none). */
  usage(sessionId: string): Promise<SessionUsage>;
  /** One slash command; Compact runs `/compact`. */
  command(sessionId: string, line: string): Promise<CommandOutcome>;
  /** Whether the Host can hand a path to the desktop's file manager. */
  canReveal(): Promise<boolean>;
  /** Show a verified path in the Finder. */
  reveal(path: string): Promise<void>;
  /** Files the Session's turns declared (`deliverables/presented`). */
  deliverables(sessionId: string): Deliverable[];
};

const fromHost: SessionFactsSource = {
  usage: async (sessionId) => {
    const transport = sessionTransport();
    if (!transport?.ready || !transport.sessionUsage) return {};
    return transport.sessionUsage(sessionId);
  },
  command: async (sessionId, line) => {
    const transport = sessionTransport();
    if (!transport?.ready || !transport.executeCommand) {
      throw new Error("还没连上后台。");
    }
    return transport.executeCommand(sessionId, line);
  },
  canReveal: async () => {
    const transport = sessionTransport();
    if (!transport?.ready || !transport.canReveal) return false;
    return transport.canReveal();
  },
  reveal: async (path) => {
    const transport = sessionTransport();
    if (!transport?.ready || !transport.revealPath) throw new Error("还没连上后台。");
    await transport.revealPath(path);
  },
  deliverables: (sessionId) => controllerFor(sessionId).view().deliverables,
};

let source: SessionFactsSource = fromHost;

export function sessionFactsSource(): SessionFactsSource {
  return source;
}

/** Substitute the Host reads (a test's fake). */
export function setSessionFactsSource(next: SessionFactsSource | undefined): void {
  source = next ?? fromHost;
}

const usage = signal<Readonly<Record<string, UsageRead>>>({});
const compact = signal<Readonly<Record<string, CompactRead>>>({});
const reveal = signal<"unknown" | "yes" | "no">("unknown");

export function usageOf(sessionId: string): UsageRead {
  return usage()[sessionId] ?? { status: "idle" };
}

export function compactOf(sessionId: string): CompactRead {
  return compact()[sessionId] ?? { status: "idle" };
}

/** True when the Host said it can hand a path to the desktop's file manager. */
export function canReveal(): boolean {
  return reveal() === "yes";
}

function writeUsage(sessionId: string, read: UsageRead): void {
  usage.set({ ...untracked(usage), [sessionId]: read });
}

function writeCompact(sessionId: string, read: CompactRead): void {
  compact.set({ ...untracked(compact), [sessionId]: read });
}

/** Read this Session's occupancy and tokens (no Agent is activated by it). */
export async function refreshUsage(sessionId: string): Promise<void> {
  // Untracked: a caller inside an effect must not re-run because this wrote.
  if (untracked(usage)[sessionId]?.status === "loading") return;
  writeUsage(sessionId, { status: "loading" });
  try {
    writeUsage(sessionId, {
      status: "ready",
      usage: await sessionFactsSource().usage(sessionId),
    });
  } catch (error) {
    writeUsage(sessionId, { status: "failed", error: readableError(error) });
  }
}

/** Ask the Host once per run whether it can reveal a path in the file manager. */
export async function probeReveal(): Promise<void> {
  if (untracked(reveal) !== "unknown") return;
  try {
    reveal.set((await sessionFactsSource().canReveal()) ? "yes" : "no");
  } catch {
    reveal.set("no");
  }
}

/** `/compact`: dsh's own manual compaction, with its outcome shown in place. */
export async function compactSession(sessionId: string): Promise<void> {
  if (untracked(compact)[sessionId]?.status === "running") return;
  writeCompact(sessionId, { status: "running" });
  try {
    const outcome = await sessionFactsSource().command(sessionId, "/compact");
    if (outcome.kind === "success") {
      writeCompact(sessionId, { status: "done", text: outcome.text ?? "已压缩。" });
      await refreshUsage(sessionId);
    } else {
      writeCompact(sessionId, { status: "failed", error: outcome.text ?? "压缩没有完成。" });
    }
  } catch (error) {
    writeCompact(sessionId, { status: "failed", error: readableError(error) });
  }
}

/** Show a path in the Finder (`session.openWorkspacePath` with `reveal`). */
export async function revealPath(path: string): Promise<void> {
  await sessionFactsSource().reveal(path);
}

/** 1 200 → "1.2K", 128 000 → "128K", 1 048 576 → "1.0M". */
export function compactCount(value: number): string {
  const scaled = (candidate: number) =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${scaled(value / 1_000)}K`;
  return `${scaled(value / 1_000_000)}M`;
}
