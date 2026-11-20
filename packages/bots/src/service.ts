/**
 * The `bots` Remote: Registry reads and writes plus derived Bot presets.
 *
 * This service owns the product Registry. The Client and the official dsh
 * Session flow read the snapshot, write through the same methods, and follow
 * `watch` for changes instead of polling. Every successful write returns the
 * new snapshot and a revision greater than the one before it.
 */
import type { Context } from "@deepseek-ai/cordis";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

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
  releaseSegment,
  renameSegment,
  unarchiveBot,
  updateBot,
  updateTemplate,
  type BotRegistry,
} from "./registry.ts";
import type { BotInput, BotPatch, TemplateInput, TemplatePatch } from "./registry.ts";
import { BotsRegistryStore, type BotsSnapshot } from "./store.ts";

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
  async snapshot(): Promise<BotsSnapshot> {
    await this.ready;
    return this.store.snapshot();
  }

  /**
   * Stream the snapshot on subscription, then again after every write.
   * @param signal - subscription lifetime; aborting ends only this stream.
   */
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

  async createTemplate(request: TemplateInput): Promise<BotsSnapshot> {
    return this.change((registry) => createTemplate(registry, request));
  }

  async updateTemplate(request: { id: string; patch: TemplatePatch }): Promise<BotsSnapshot> {
    return this.change((registry) => updateTemplate(registry, request.id, request.patch));
  }

  async deleteTemplate(id: string): Promise<BotsSnapshot> {
    return this.change((registry) => deleteTemplate(registry, id));
  }

  /** Upsert product templates from every non-derived dsh Agent preset. */
  async importTemplates(): Promise<BotsSnapshot> {
    await this.ready;
    const presets = await this.ctx.agentPresets.list();
    return this.change((registry) => importTemplates(registry, presets));
  }

  async createBot(request: BotInput): Promise<BotsSnapshot> {
    return this.change((registry) => createBot(registry, request));
  }

  async updateBot(request: { id: string; patch: BotPatch }): Promise<BotsSnapshot> {
    return this.change((registry) => updateBot(registry, request.id, request.patch));
  }

  async initializeBot(id: string): Promise<BotsSnapshot> {
    return this.change((registry) => initializeBot(registry, id));
  }

  async claimSegment(request: {
    botId: string;
    sessionId: string;
    workspaceId: string;
  }): Promise<BotsSnapshot> {
    return this.change((registry) =>
      claimSegment(registry, request.botId, request.sessionId, request.workspaceId),
    );
  }

  async renameSegment(request: {
    botId: string;
    sessionId: string;
    title: string | null;
  }): Promise<BotsSnapshot> {
    return this.change((registry) =>
      renameSegment(registry, request.botId, request.sessionId, request.title),
    );
  }

  async releaseSegment(request: { botId: string; sessionId: string }): Promise<BotsSnapshot> {
    return this.change((registry) => releaseSegment(registry, request.botId, request.sessionId));
  }

  async archive(id: string): Promise<BotsSnapshot> {
    return this.change((registry) => archiveBot(registry, id));
  }

  async unarchive(id: string): Promise<BotsSnapshot> {
    return this.change((registry) => unarchiveBot(registry, id));
  }

  async deleteBot(id: string): Promise<BotsSnapshot> {
    return this.change((registry) => deleteBot(registry, id));
  }

  async assignPreset(request: { botId: string; presetId: string }): Promise<BotsSnapshot> {
    return this.change((registry) =>
      assignDerivedPreset(registry, request.botId, request.presetId),
    );
  }

  async derivePreset(request: DerivedPresetDeriveRequest): Promise<DerivedPresetDeriveResult> {
    await this.ready;
    return this.presets.derive(request);
  }

  async readPreset(presetId: string): Promise<DerivedPresetRecord> {
    await this.ready;
    return this.presets.read(presetId);
  }

  async updatePreset(
    presetId: string,
    patch: DerivedPresetUpdateRequest,
  ): Promise<DerivedPresetRecord> {
    await this.ready;
    return this.presets.update(presetId, patch);
  }

  async discardPreset(presetId: string): Promise<DerivedPresetRemoveResult> {
    await this.ready;
    return this.presets.remove(presetId);
  }

  private async change(change: (registry: BotRegistry) => BotRegistry): Promise<BotsSnapshot> {
    await this.ready;
    return this.store.write(change);
  }
}

// `vp pack` leaves standard-decorator syntax in place, and Node cannot parse
// it. Mark the same methods through the exported decorator API instead: the
// Gateway reads exactly the descriptor `@Remote` would have written.
for (const [method, exportName, stream] of [
  ["snapshot", "snapshot", false],
  ["watch", "watch", true],
  ["createTemplate", "createTemplate", false],
  ["updateTemplate", "updateTemplate", false],
  ["deleteTemplate", "deleteTemplate", false],
  ["importTemplates", "importTemplates", false],
  ["createBot", "createBot", false],
  ["updateBot", "updateBot", false],
  ["initializeBot", "initializeBot", false],
  ["claimSegment", "claimSegment", false],
  ["renameSegment", "renameSegment", false],
  ["releaseSegment", "releaseSegment", false],
  ["archive", "archive", false],
  ["unarchive", "unarchive", false],
  ["deleteBot", "deleteBot", false],
  ["assignPreset", "assignPreset", false],
  ["derivePreset", "derivePreset", false],
  ["readPreset", "readPreset", false],
  ["updatePreset", "updatePreset", false],
  ["discardPreset", "discardPreset", false],
] as const) {
  markRemoteMethod(BotsService.prototype, method, exportName, stream);
}

function markRemoteMethod(
  prototype: object,
  method: string,
  exportName: string,
  stream: boolean,
): void {
  const member = (prototype as Record<string, unknown>)[method];
  if (typeof member !== "function") {
    throw new TypeError(`bots: ${method} is not a method`);
  }
  const context = {
    kind: "method",
    name: method,
    static: false,
    private: false,
    access: { has: () => true, get: () => undefined },
    addInitializer(initializer: (this: object) => void) {
      // The decorator initializer runs once per instance and only reads the
      // prototype; a bare prototype child gives it the same target.
      initializer.call(Object.create(prototype));
    },
    metadata: {},
  } as unknown as ClassMethodDecoratorContext;
  type Mark = (member: never, context: ClassMethodDecoratorContext) => void;
  const decorate = stream
    ? (Remote as unknown as (options: { mode: "stream" }) => Mark)({ mode: "stream" })
    : (Remote as unknown as (name: string) => Mark)(exportName);
  decorate(member as never, context);
}
