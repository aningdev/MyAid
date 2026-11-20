/**
 * Unchecked Registry fixtures for tests and harnesses. The plugin owns the
 * write rules; these builders only fill the shape the UI reads.
 */
import { defaultIdentity, type BotIdentity } from "../features/bots/identity";
import { BOTS_FIXTURE_KEY } from "../features/bots/memory";
import {
  emptyRegistry,
  REGISTRY_VERSION,
  type Bot,
  type BotRegistry,
  type BotTemplate,
} from "../features/bots/model";

export { emptyRegistry, BOTS_FIXTURE_KEY };

export function botsStorage(registry: BotRegistry): Record<string, string> {
  return { [BOTS_FIXTURE_KEY]: JSON.stringify(registry) };
}

export function createTemplate(
  registry: BotRegistry,
  input: { name: string; presetId: string },
  id: string,
): BotRegistry {
  const template: BotTemplate = { id, name: input.name, presetId: input.presetId };
  return { ...registry, templates: [...registry.templates, template] };
}

export function createBot(
  registry: BotRegistry,
  input: {
    name: string;
    description?: string | null;
    templateId: string;
    defaultModel?: string | null;
    defaultThinking?: string | null;
    defaultWorkspacePath?: string | null;
    identity?: BotIdentity;
  },
  id: string,
): BotRegistry {
  const bot: Bot = {
    id,
    name: input.name,
    description: input.description ?? null,
    templateId: input.templateId,
    defaultModel: input.defaultModel ?? null,
    defaultThinking: input.defaultThinking ?? null,
    defaultWorkspacePath: input.defaultWorkspacePath ?? null,
    hadDialogue: false,
    status: "draft",
    boundPresetId: null,
    derivedPresetId: null,
    archived: false,
    identity: input.identity ?? defaultIdentity(id),
    segments: [],
  };
  return { ...registry, version: REGISTRY_VERSION, bots: [...registry.bots, bot] };
}

export function initializeBot(registry: BotRegistry, botId: string): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) => {
      if (bot.id !== botId) return bot;
      const template = registry.templates.find((item) => item.id === bot.templateId);
      return { ...bot, status: "ready" as const, boundPresetId: template?.presetId ?? null };
    }),
  };
}

export function renameSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  title: string | null,
): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) =>
      bot.id === botId
        ? {
            ...bot,
            segments: bot.segments.map((segment) =>
              segment.sessionId === sessionId ? { ...segment, title } : segment,
            ),
          }
        : bot,
    ),
  };
}

export function claimSegment(
  registry: BotRegistry,
  botId: string,
  sessionId: string,
  workspaceId: string,
): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) =>
      bot.id === botId
        ? {
            ...bot,
            hadDialogue: true,
            segments: [...bot.segments, { sessionId, workspaceId, title: null }],
          }
        : bot,
    ),
  };
}

export function archiveBot(registry: BotRegistry, botId: string): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) => (bot.id === botId ? { ...bot, archived: true } : bot)),
  };
}

export function unarchiveBot(registry: BotRegistry, botId: string): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) => (bot.id === botId ? { ...bot, archived: false } : bot)),
  };
}

export function updateBot(
  registry: BotRegistry,
  botId: string,
  patch: Partial<Pick<Bot, "name" | "description" | "defaultModel" | "templateId" | "identity">>,
): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) => (bot.id === botId ? { ...bot, ...patch } : bot)),
  };
}

export function assignDerivedPreset(
  registry: BotRegistry,
  botId: string,
  presetId: string,
): BotRegistry {
  return {
    ...registry,
    bots: registry.bots.map((bot) =>
      bot.id === botId ? { ...bot, derivedPresetId: presetId } : bot,
    ),
  };
}

export function mainBot(registry: BotRegistry = emptyRegistry()): BotRegistry {
  return {
    ...registry,
    bots: [
      {
        id: "bots-main",
        name: "Main Bot",
        description: null,
        templateId: "main",
        defaultModel: null,
        defaultThinking: null,
        defaultWorkspacePath: null,
        hadDialogue: false,
        status: "ready",
        boundPresetId: "default",
        derivedPresetId: null,
        archived: false,
        identity: { color: "indigo", shape: "round", face: "calm" },
        segments: [],
      },
      ...registry.bots.filter((bot) => bot.id !== "bots-main"),
    ],
    templates: registry.templates.some((item) => item.id === "main")
      ? registry.templates
      : [{ id: "main", name: "Main", presetId: "default" }, ...registry.templates],
  };
}
