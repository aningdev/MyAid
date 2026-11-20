/**
 * The Registry the UI reads. The `bots` plugin owns it: a connection takes
 * `snapshot`, then follows `watch`, and every write applies the snapshot that
 * comes back. Nothing here is stored on the Device.
 *
 * A Host-less test installs the in-memory gateway (`memory.ts`) instead.
 */
import { Storage, signal } from "nsh";

import { usesTestStorage } from "../../lib/data-root";
import type { BotInput, BotPatch, BotsGateway, BotsSnapshot } from "../../lib/dsh/bots-gateway";
import { readableError } from "../../lib/dsh/connection";
import { t } from "../../lib/i18n";
import { createMemoryBots, BOTS_FIXTURE_KEY, type MemoryBots } from "./memory";
import { emptyRegistry, type BotRegistry } from "./model";

export const registry = signal<BotRegistry>(emptyRegistry());
export const ready = signal(false);
export const saving = signal(false);
export const loadError = signal<string | null>(null);
export const actionError = signal<string | null>(null);

let epoch = 0;
let watchAbort: AbortController | undefined;
let gateway: BotsGateway | undefined;
let seenRevision = -1;
const readyListeners = new Set<() => void>();

/** True once a gateway is installed (a Host connection, or a test double). */
export function botsAttached(): boolean {
  return gateway !== undefined;
}

/** Run `listener` when a snapshot has been applied, including the current one. */
export function onRegistryReady(listener: () => void): () => void {
  readyListeners.add(listener);
  if (ready()) listener();
  return () => {
    readyListeners.delete(listener);
  };
}

/**
 * Host-less tests: seed the in-memory gateway from the fixture the test put
 * in Storage. A real launch does not call this.
 */
export async function openTestBots(): Promise<void> {
  if (!usesTestStorage() || gateway) return;
  const text = await Storage.getItem(BOTS_FIXTURE_KEY);
  if (!text) {
    await followBots(createMemoryBots(emptyRegistry()));
    return;
  }
  try {
    const seeded = JSON.parse(text) as BotRegistry;
    await followBots(createMemoryBots(seeded));
  } catch (error) {
    loadError.set(messageOf(error));
    ready.set(true);
    notifyReady();
  }
}

/**
 * Install an in-memory gateway and show `initial`, without a watch loop.
 * Unit tests that only write through the Client use this; a watch test calls
 * {@link followBots} instead.
 */
export async function useMemoryBots(initial: BotRegistry): Promise<MemoryBots> {
  const memory = createMemoryBots(initial);
  epoch += 1;
  watchAbort?.abort();
  watchAbort = undefined;
  gateway = memory;
  seenRevision = -1;
  applySnapshot(await memory.snapshot());
  loadError.set(null);
  ready.set(true);
  return memory;
}

/** Subscribe to `gateway`, replacing any previous watch. */
export async function followBots(next: BotsGateway): Promise<void> {
  const mine = ++epoch;
  watchAbort?.abort();
  const controller = new AbortController();
  watchAbort = controller;
  gateway = next;
  try {
    const snapshot = await next.snapshot();
    if (mine !== epoch) return;
    applySnapshot(snapshot);
    loadError.set(null);
    ready.set(true);
    notifyReady();
  } catch (error) {
    if (mine !== epoch) return;
    loadError.set(messageOf(error));
    ready.set(true);
    notifyReady();
    return;
  }
  void readWatch(next, controller, mine);
}

/** Drop the subscription. The next connection subscribes again. */
export function stopBots(): void {
  epoch += 1;
  watchAbort?.abort();
  watchAbort = undefined;
  gateway = undefined;
  seenRevision = -1;
  ready.set(false);
  saving.set(false);
}

export function clearActionError(): void {
  actionError.set(null);
}

export function setActionError(message: string | null): void {
  actionError.set(message);
}

/** True when a write would not go through (still loading, unreadable, or another write). */
export function writeBlocked(): boolean {
  return !ready() || loadError() !== null || saving() || gateway === undefined;
}

export async function importTemplates(): Promise<boolean> {
  return write((current) => current.importTemplates());
}

export async function createBot(request: BotInput): Promise<boolean> {
  return write((current) => current.createBot(request));
}

export async function updateBot(id: string, patch: BotPatch): Promise<boolean> {
  return write((current) => current.updateBot({ id, patch }));
}

export async function initializeBot(botId: string): Promise<boolean> {
  return write((current) => current.initializeBot(botId));
}

export async function claimSegment(
  botId: string,
  sessionId: string,
  workspaceId: string,
): Promise<boolean> {
  return write((current) => current.claimSegment({ botId, sessionId, workspaceId }));
}

export async function renameSegment(
  botId: string,
  sessionId: string,
  title: string | null,
): Promise<boolean> {
  return write((current) => current.renameSegment({ botId, sessionId, title }));
}

export async function releaseSegment(botId: string, sessionId: string): Promise<boolean> {
  return write((current) => current.releaseSegment({ botId, sessionId }));
}

export async function archiveBot(botId: string): Promise<boolean> {
  return write((current) => current.archive(botId));
}

export async function unarchiveBot(botId: string): Promise<boolean> {
  return write((current) => current.unarchive(botId));
}

export async function deleteBot(botId: string): Promise<boolean> {
  return write((current) => current.deleteBot(botId));
}

export async function assignPreset(botId: string, presetId: string): Promise<boolean> {
  return write((current) => current.assignPreset({ botId, presetId }));
}

async function write(run: (current: BotsGateway) => Promise<BotsSnapshot>): Promise<boolean> {
  const current = gateway;
  if (writeBlocked() || !current) return false;
  saving.set(true);
  actionError.set(null);
  try {
    applySnapshot(await run(current));
    return true;
  } catch (error) {
    actionError.set(messageOf(error));
    return false;
  } finally {
    saving.set(false);
  }
}

async function readWatch(
  source: BotsGateway,
  controller: AbortController,
  mine: number,
): Promise<void> {
  try {
    for await (const snapshot of source.watch(controller.signal)) {
      if (mine !== epoch) return;
      applySnapshot(snapshot);
    }
  } catch (error) {
    if (mine !== epoch || controller.signal.aborted) return;
    loadError.set(messageOf(error));
  }
}

function applySnapshot(snapshot: BotsSnapshot): void {
  if (snapshot.revision < seenRevision) return;
  seenRevision = snapshot.revision;
  registry.set(snapshot.registry as BotRegistry);
}

function notifyReady(): void {
  for (const listener of readyListeners) listener();
}

function messageOf(error: unknown): string {
  if (isRemoteError(error)) return error.message || t("registry.saveFailed");
  return readableError(error);
}

function isRemoteError(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isDSHRemoteError?: unknown }).isDSHRemoteError === true
  );
}
