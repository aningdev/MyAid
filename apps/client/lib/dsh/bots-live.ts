/**
 * The mounted `bots` namespace as a {@link BotsGateway}. Direct calls come
 * back as Typert results; `watch` yields snapshots.
 */
import type { BotsGateway, BotsNamespace, BotsSnapshot } from "./bots-gateway";

export function liveBots(namespace: BotsNamespace): BotsGateway {
  return {
    snapshot: () => asSnapshot(namespace.snapshot()),
    watch: (signal) => watch(namespace, signal),
    createTemplate: (request) => asSnapshot(namespace.createTemplate(request)),
    updateTemplate: (request) => asSnapshot(namespace.updateTemplate(request)),
    deleteTemplate: (templateId) => asSnapshot(namespace.deleteTemplate(templateId)),
    importTemplates: () => asSnapshot(namespace.importTemplates()),
    createBot: (request) => asSnapshot(namespace.createBot(request)),
    updateBot: (request) => asSnapshot(namespace.updateBot(request)),
    initializeBot: (botId) => asSnapshot(namespace.initializeBot(botId)),
    claimSegment: (request) => asSnapshot(namespace.claimSegment(request)),
    renameSegment: (request) => asSnapshot(namespace.renameSegment(request)),
    releaseSegment: (request) => asSnapshot(namespace.releaseSegment(request)),
    archive: (botId) => asSnapshot(namespace.archive(botId)),
    unarchive: (botId) => asSnapshot(namespace.unarchive(botId)),
    deleteBot: (botId) => asSnapshot(namespace.deleteBot(botId)),
    assignPreset: (request) => asSnapshot(namespace.assignPreset(request)),
  };
}

async function* watch(namespace: BotsNamespace, signal: AbortSignal): AsyncIterable<BotsSnapshot> {
  for await (const item of namespace.watch(signal)) {
    yield unwrapSnapshot(item);
  }
}

async function asSnapshot(result: Promise<unknown>): Promise<BotsSnapshot> {
  return unwrapSnapshot(await result);
}

function unwrapSnapshot(result: unknown): BotsSnapshot {
  if (isResult(result)) {
    if (result.ok !== true) {
      const error = result.error ?? { code: "unknown/error", message: String(result) };
      throw new Error(`${error.code ?? "unknown/error"}: ${error.message ?? ""}`);
    }
    return result.value as BotsSnapshot;
  }
  return result as BotsSnapshot;
}

function isResult(
  value: unknown,
): value is { ok?: boolean; value?: unknown; error?: { code?: string; message?: string } } {
  return typeof value === "object" && value !== null && "ok" in value;
}
