/**
 * The `bots` Remote: Registry reads and writes plus derived Bot presets.
 *
 * This service owns the product Registry. The Client and the official dsh
 * Session flow read the snapshot, write through the same methods, and follow
 * `watch` for changes instead of polling. Every successful write returns the
 * new snapshot and a revision greater than the one before it.
 */
import type { Context } from "@deepseek-ai/cordis";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

import type {
  DerivedPresetDeriveRequest,
  DerivedPresetDeriveResult,
  DerivedPresetRecord,
  DerivedPresetRemoveResult,
  DerivedPresetUpdateRequest,
} from "./preset-types.ts";
import { DerivedPresets } from "./presets.ts";
import {
  archiveBot,
  assignDerivedPreset,
  claimSegment,
  createBot,
  createTemplate,
  deleteBot,
  deleteTemplate,
  importTemplates,
  initializeBot,
  MAIN_BOT_ID,
  presetForBot,
  releaseSegment,
  renameSegment,
  unarchiveBot,
  updateBot,
  updateTemplate,
  type BotRegistry,
} from "./registry.ts";
import type { BotInput, BotPatch, TemplateInput, TemplatePatch } from "./registry.ts";
import { BotsRegistryStore, type BotsSnapshot } from "./store.ts";

declare module "@deepseek-ai/cordis" {
  interface Context {
    bots: BotsService;
  }
}

/** One Bot another product plugin may hand work to. */
export type BotRoute = {
  id: string;
  name: string;
  description: string | null;
  /** The Bot's effective dsh Agent preset: its own edits, else its template's. */
  presetId: string;
  defaultModel: string | null;
  defaultThinking: string | null;
  workspacePath: string | null;
};

/** The ready Bots plus the Main Bot, as routing decisions need them. */
export type BotsRouting = {
  mainBot: { id: string; name: string; presetId: string };
  bots: BotRoute[];
};

export type BotsServiceOptions = {
  dataDir: string;
  /** This plugin's Registry file. */
  registryFile: string;
};

export class BotsService extends TypertRemoteService {
  static inject = ["agentPresets", "storageDomain"];

  private readonly store: BotsRegistryStore;
  private readonly presets: DerivedPresets;
  private readonly ready: Promise<void>;

  constructor(ctx: Context, options: BotsServiceOptions) {
    super(ctx, "bots");
    this.store = new BotsRegistryStore({
      file: options.registryFile,
      defaultPreset: async () => {
        const preset = await ctx.agentPresets.resolve();
        return { id: preset.id, name: preset.name };
      },
    });
    this.presets = new DerivedPresets(ctx, { dataDir: options.dataDir });
    this.ready = this.start();
    // A failed start must not become an unhandled rejection; the first Remote
    // call reports the same failure to the person.
    this.ready.catch(() => undefined);
  }

  private async start(): Promise<void> {
    await this.presets.ready;
    await this.store.load();
  }

  /** The current Registry and its revision. */
  @Remote("snapshot")
  async snapshot(): Promise<BotsSnapshot> {
    await this.ready;
    return this.store.snapshot();
  }

  /**
   * Stream the snapshot on subscription, then again after every write.
   * @param signal - subscription lifetime; aborting ends only this stream.
   */
  @Remote({ mode: "stream" })
  async *watch(signal: AbortSignal): AsyncIterable<BotsSnapshot> {
    await this.ready;
    let wake = Promise.withResolvers<void>();
    let dirty = true;
    const notify = (): void => {
      dirty = true;
      wake.resolve();
    };
    const unsubscribe = this.store.subscribe(notify);
    signal.addEventListener("abort", notify, { once: true });
    try {
      while (!signal.aborted) {
        if (!dirty) await wake.promise;
        if (signal.aborted) break;
        dirty = false;
        wake = Promise.withResolvers<void>();
        yield await this.store.snapshot();
      }
    } finally {
      unsubscribe();
      signal.removeEventListener("abort", notify);
    }
  }

  @Remote("createTemplate")
  async createTemplate(request: TemplateInput): Promise<BotsSnapshot> {
    return this.change((registry) => createTemplate(registry, request));
  }

  @Remote("updateTemplate")
  async updateTemplate(request: { id: string; patch: TemplatePatch }): Promise<BotsSnapshot> {
    return this.change((registry) => updateTemplate(registry, request.id, request.patch));
  }

  @Remote("deleteTemplate")
  async deleteTemplate(templateId: string): Promise<BotsSnapshot> {
    return this.change((registry) => deleteTemplate(registry, templateId));
  }

  /** Upsert product templates from every non-derived dsh Agent preset. */
  @Remote("importTemplates")
  async importTemplates(): Promise<BotsSnapshot> {
    await this.ready;
    const presets = await this.ctx.agentPresets.list();
    return this.change((registry) => importTemplates(registry, presets));
  }

  @Remote("createBot")
  async createBot(request: BotInput): Promise<BotsSnapshot> {
    return this.change((registry) => createBot(registry, request));
  }

  @Remote("updateBot")
  async updateBot(request: { id: string; patch: BotPatch }): Promise<BotsSnapshot> {
    return this.change((registry) => updateBot(registry, request.id, request.patch));
  }

  @Remote("initializeBot")
  async initializeBot(botId: string): Promise<BotsSnapshot> {
    return this.change((registry) => initializeBot(registry, botId));
  }

  @Remote("claimSegment")
  async claimSegment(request: {
    botId: string;
    sessionId: string;
    workspaceId: string;
  }): Promise<BotsSnapshot> {
    return this.change((registry) =>
      claimSegment(registry, request.botId, request.sessionId, request.workspaceId),
    );
  }

  @Remote("renameSegment")
  async renameSegment(request: {
    botId: string;
    sessionId: string;
    title: string | null;
  }): Promise<BotsSnapshot> {
    return this.change((registry) =>
      renameSegment(registry, request.botId, request.sessionId, request.title),
    );
  }

  @Remote("releaseSegment")
  async releaseSegment(request: { botId: string; sessionId: string }): Promise<BotsSnapshot> {
    return this.change((registry) => releaseSegment(registry, request.botId, request.sessionId));
  }

  @Remote("archive")
  async archive(botId: string): Promise<BotsSnapshot> {
    return this.change((registry) => archiveBot(registry, botId));
  }

  @Remote("unarchive")
  async unarchive(botId: string): Promise<BotsSnapshot> {
    return this.change((registry) => unarchiveBot(registry, botId));
  }

  @Remote("deleteBot")
  async deleteBot(botId: string): Promise<BotsSnapshot> {
    return this.change((registry) => deleteBot(registry, botId));
  }

  @Remote("assignPreset")
  async assignPreset(request: { botId: string; presetId: string }): Promise<BotsSnapshot> {
    return this.change((registry) =>
      assignDerivedPreset(registry, request.botId, request.presetId),
    );
  }

  @Remote("derivePreset")
  async derivePreset(request: DerivedPresetDeriveRequest): Promise<DerivedPresetDeriveResult> {
    await this.ready;
    return this.presets.derive(request);
  }

  @Remote("readPreset")
  async readPreset(presetId: string): Promise<DerivedPresetRecord> {
    await this.ready;
    return this.presets.read(presetId);
  }

  @Remote("updatePreset")
  async updatePreset(
    presetId: string,
    patch: DerivedPresetUpdateRequest,
  ): Promise<DerivedPresetRecord> {
    await this.ready;
    return this.presets.update(presetId, patch);
  }

  @Remote("discardPreset")
  async discardPreset(presetId: string): Promise<DerivedPresetRemoveResult> {
    await this.ready;
    return this.presets.remove(presetId);
  }

  /**
   * Ready, unarchived Bots plus the Main Bot, with the preset each one runs.
   * Other product plugins route work through this instead of reading the file.
   */
  async routing(): Promise<BotsRouting> {
    await this.ready;
    const { registry } = await this.store.snapshot();
    const main = registry.bots.find((bot) => bot.id === MAIN_BOT_ID);
    if (main === undefined) {
      throw new RemoteError("bots/not-found", `缺少 ${MAIN_BOT_ID}。`, {
        kind: "bot",
        id: MAIN_BOT_ID,
      });
    }
    return {
      mainBot: { id: main.id, name: main.name, presetId: presetForBot(registry, main.id) },
      bots: registry.bots
        .filter((bot) => bot.status === "ready" && !bot.archived)
        .map((bot) => ({
          id: bot.id,
          name: bot.name,
          description: bot.description,
          presetId: presetForBot(registry, bot.id),
          defaultModel: bot.defaultModel,
          defaultThinking: bot.defaultThinking,
          workspacePath: bot.defaultWorkspacePath,
        })),
    };
  }

  /** The Bot whose Dialogue owns one Session, or null when no Bot does. */
  async botForSession(sessionId: string): Promise<string | null> {
    await this.ready;
    const { registry } = await this.store.snapshot();
    const owner = registry.bots.find((bot) =>
      bot.segments.some((segment) => segment.sessionId === sessionId),
    );
    return owner?.id ?? null;
  }

  private async change(change: (registry: BotRegistry) => BotRegistry): Promise<BotsSnapshot> {
    await this.ready;
    return this.store.write(change);
  }
}
