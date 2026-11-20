/**
 * The Client's view of the `bots` Remote. Production wraps the mounted
 * namespace; tests install an in-memory one. Every successful call returns
 * the snapshot the plugin would return.
 *
 * Wire shapes live in `@dsh-bot/dsh-web-protocol/bots`. The plugin owns the
 * same shapes and does not depend on that package.
 */
import type {
  BotInput,
  BotPatch,
  BotsSnapshot,
  TemplateInput,
  TemplatePatch,
} from "@dsh-bot/dsh-web-protocol/bots";

export type { BotInput, BotPatch, BotsSnapshot, TemplateInput, TemplatePatch };

/** Methods the Client calls. Names match the `bots` Remote. */
export interface BotsGateway {
  snapshot(): Promise<BotsSnapshot>;
  watch(signal: AbortSignal): AsyncIterable<BotsSnapshot>;
  createTemplate(request: TemplateInput): Promise<BotsSnapshot>;
  updateTemplate(request: { id: string; patch: TemplatePatch }): Promise<BotsSnapshot>;
  deleteTemplate(templateId: string): Promise<BotsSnapshot>;
  importTemplates(): Promise<BotsSnapshot>;
  createBot(request: BotInput): Promise<BotsSnapshot>;
  updateBot(request: { id: string; patch: BotPatch }): Promise<BotsSnapshot>;
  initializeBot(botId: string): Promise<BotsSnapshot>;
  claimSegment(request: {
    botId: string;
    sessionId: string;
    workspaceId: string;
  }): Promise<BotsSnapshot>;
  renameSegment(request: {
    botId: string;
    sessionId: string;
    title: string | null;
  }): Promise<BotsSnapshot>;
  releaseSegment(request: { botId: string; sessionId: string }): Promise<BotsSnapshot>;
  archive(botId: string): Promise<BotsSnapshot>;
  unarchive(botId: string): Promise<BotsSnapshot>;
  deleteBot(botId: string): Promise<BotsSnapshot>;
  assignPreset(request: { botId: string; presetId: string }): Promise<BotsSnapshot>;
}

/** The mounted namespace, before results are unwrapped. */
export type BotsNamespace = {
  snapshot(): Promise<unknown>;
  watch(signal: AbortSignal): AsyncIterable<unknown>;
  createTemplate(request: TemplateInput): Promise<unknown>;
  updateTemplate(request: { id: string; patch: TemplatePatch }): Promise<unknown>;
  deleteTemplate(templateId: string): Promise<unknown>;
  importTemplates(): Promise<unknown>;
  createBot(request: BotInput): Promise<unknown>;
  updateBot(request: { id: string; patch: BotPatch }): Promise<unknown>;
  initializeBot(botId: string): Promise<unknown>;
  claimSegment(request: {
    botId: string;
    sessionId: string;
    workspaceId: string;
  }): Promise<unknown>;
  renameSegment(request: {
    botId: string;
    sessionId: string;
    title: string | null;
  }): Promise<unknown>;
  releaseSegment(request: { botId: string; sessionId: string }): Promise<unknown>;
  archive(botId: string): Promise<unknown>;
  unarchive(botId: string): Promise<unknown>;
  deleteBot(botId: string): Promise<unknown>;
  assignPreset(request: { botId: string; presetId: string }): Promise<unknown>;
};
