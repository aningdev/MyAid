/**
 * In-memory `bots` Remote for tests. It applies the same field changes the
 * UI asks for and pushes the snapshot to `watch`. It is not a second copy of
 * the plugin's rules: a real Host still rejects what this double accepts.
 *
 * A test app (`usesTestStorage`) mirrors the latest Registry into its own
 * Storage so the test process can see a write. That key is not a product cache.
 */
import { Storage } from "nsh";

import { usesTestStorage } from "../../lib/data-root";
import type {
  BotInput,
  BotPatch,
  BotsGateway,
  BotsSnapshot,
  TemplateInput,
} from "../../lib/dsh/bots-gateway";
import { defaultIdentity } from "./identity";
import type { Bot, BotRegistry, BotTemplate, Segment } from "./model";

/** Storage key a Host-less test uses to seed this double. Not a product file. */
export const BOTS_FIXTURE_KEY = "dsh-bot.test.bots";

export type MemoryBots = BotsGateway & {
  /** A snapshot from outside this Client, as another Device's write would arrive. */
  publish(registry: BotRegistry): void;
};

export function createMemoryBots(initial: BotRegistry): MemoryBots {
  let registry = clone(initial);
  let revision = 0;
  const waiters: Array<() => void> = [];

  const picture = (): BotsSnapshot => ({ registry: clone(registry), revision });

  const emit = (next: BotRegistry): BotsSnapshot => {
    registry = clone(next);
    revision += 1;
    const published = picture();
    if (usesTestStorage()) {
      void Storage.setItem(BOTS_FIXTURE_KEY, JSON.stringify(published.registry));
    }
    const pending = waiters.splice(0);
    for (const wake of pending) wake();
    return published;
  };

  const wait = (signal: AbortSignal): Promise<void> =>
    new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const wake = (): void => {
        signal.removeEventListener("abort", wake);
        resolve();
      };
      waiters.push(wake);
      signal.addEventListener("abort", wake, { once: true });
    });

  return {
    async snapshot() {
      return picture();
    },
    async *watch(signal: AbortSignal) {
      let seen = -1;
      while (!signal.aborted) {
        if (revision !== seen) {
          seen = revision;
          yield picture();
          continue;
        }
        await wait(signal);
      }
    },
    async createTemplate(request) {
      return emit(addTemplate(registry, request));
    },
    async updateTemplate(request) {
      return emit(patchTemplate(registry, request.id, request.patch));
    },
    async deleteTemplate(templateId) {
      return emit({
        ...registry,
        templates: registry.templates.filter((item) => item.id !== templateId),
      });
    },
    async importTemplates() {
      return picture();
    },
    async createBot(request) {
      return emit(addBot(registry, request));
    },
    async updateBot(request) {
      return emit(patchBot(registry, request.id, request.patch));
    },
    async initializeBot(botId) {
      return emit(markReady(registry, botId));
    },
    async claimSegment(request) {
      return emit(appendSegment(registry, request));
    },
    async renameSegment(request) {
      return emit(retitle(registry, request));
    },
    async releaseSegment(request) {
      return emit(dropSegment(registry, request.botId, request.sessionId));
    },
    async archive(botId) {
      return emit(setArchived(registry, botId, true));
    },
    async unarchive(botId) {
      return emit(setArchived(registry, botId, false));
    },
    async deleteBot(botId) {
      return emit({
        ...registry,
        bots: registry.bots.filter((bot) => bot.id !== botId),
      });
    },
    async assignPreset(request) {
      return emit(patchBot(registry, request.botId, { derivedPresetId: request.presetId }));
    },
    publish(next) {
      emit(next);
    },
  };
}

function addTemplate(registry: BotRegistry, request: TemplateInput): BotRegistry {
  const template: BotTemplate = {
    id: request.id,
    name: request.name.trim(),
    presetId: request.presetId.trim(),
  };
  return { ...registry, templates: [...registry.templates, template] };
}

function patchTemplate(
  registry: BotRegistry,
  id: string,
  patch: { name?: string; presetId?: string },
): BotRegistry {
  return {
    ...registry,
    templates: registry.templates.map((item) =>
      item.id === id
        ? {
            ...item,
            name: patch.name === undefined ? item.name : patch.name.trim(),
            presetId: patch.presetId === undefined ? item.presetId : patch.presetId.trim(),
          }
        : item,
    ),
  };
}

function addBot(registry: BotRegistry, request: BotInput): BotRegistry {
  const bot: Bot = {
    id: request.id,
    name: request.name.trim(),
    description: blank(request.description ?? null),
    templateId: request.templateId,
    defaultModel: blank(request.defaultModel ?? null),
    defaultThinking: blank(request.defaultThinking ?? null),
    defaultWorkspacePath: blank(request.defaultWorkspacePath ?? null),
    hadDialogue: false,
    status: "draft",
    boundPresetId: null,
    derivedPresetId: null,
    archived: false,
    identity: request.identity ?? defaultIdentity(request.id),
    segments: [],
  };
  return { ...registry, bots: [...registry.bots, bot] };
}

function patchBot(
  registry: BotRegistry,
  id: string,
  patch: BotPatch & { derivedPresetId?: string },
): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) => {
      if (bot.id !== id) return bot;
      return {
        ...bot,
        name: patch.name === undefined ? bot.name : patch.name.trim(),
        description: patch.description === undefined ? bot.description : blank(patch.description),
        templateId: patch.templateId === undefined ? bot.templateId : patch.templateId,
        defaultModel:
          patch.defaultModel === undefined ? bot.defaultModel : blank(patch.defaultModel),
        defaultThinking:
          patch.defaultThinking === undefined ? bot.defaultThinking : blank(patch.defaultThinking),
        defaultWorkspacePath:
          patch.defaultWorkspacePath === undefined
            ? bot.defaultWorkspacePath
            : blank(patch.defaultWorkspacePath),
        identity: patch.identity ?? bot.identity,
        derivedPresetId: patch.derivedPresetId ?? bot.derivedPresetId,
      };
    }),
  };
}

function markReady(registry: BotRegistry, botId: string): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) => {
      if (bot.id !== botId) return bot;
      const template = registry.templates.find((item) => item.id === bot.templateId);
      return {
        ...bot,
        status: "ready",
        boundPresetId: bot.boundPresetId ?? template?.presetId ?? null,
      };
    }),
  };
}

function appendSegment(
  registry: BotRegistry,
  request: { botId: string; sessionId: string; workspaceId: string },
): BotRegistry {
  const segment: Segment = {
    sessionId: request.sessionId,
    workspaceId: request.workspaceId,
    title: null,
  };
  return {
    ...registry,
    bots: registry.bots.map((bot) =>
      bot.id === request.botId
        ? { ...bot, hadDialogue: true, segments: [...bot.segments, segment] }
        : bot,
    ),
  };
}

function retitle(
  registry: BotRegistry,
  request: { botId: string; sessionId: string; title: string | null },
): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) =>
      bot.id === request.botId
        ? {
            ...bot,
            segments: bot.segments.map((segment) =>
              segment.sessionId === request.sessionId
                ? { ...segment, title: blank(request.title) }
                : segment,
            ),
          }
        : bot,
    ),
  };
}

function dropSegment(registry: BotRegistry, botId: string, sessionId: string): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) =>
      bot.id === botId
        ? { ...bot, segments: bot.segments.filter((segment) => segment.sessionId !== sessionId) }
        : bot,
    ),
  };
}

function setArchived(registry: BotRegistry, botId: string, archived: boolean): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) => (bot.id === botId ? { ...bot, archived } : bot)),
  };
}

function blank(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function clone(registry: BotRegistry): BotRegistry {
  return {
    version: registry.version,
    templates: registry.templates.map((item) => ({ ...item })),
    bots: registry.bots.map((bot) => ({
      ...bot,
      identity: { ...bot.identity },
      segments: bot.segments.map((segment) => ({ ...segment })),
    })),
  };
}
