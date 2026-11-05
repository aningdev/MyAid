import { platform, signal, untracked } from "nsh";
import { createNavStack } from "nsh/base";

import { isDesktopLayout } from "../../workspace/layout";
import { setModuleAtRoot } from "../../workspace/state";
import {
  createBot,
  createTemplate,
  deleteTemplate,
  emptyRegistry,
  initializeBot,
  RegistryRejection,
  updateBot,
  updateTemplate,
  type BotRegistry,
} from "./model";
import { BotRegistryRepository, defaultRegistryPath, fileStore, memoryStore } from "./store";

export type BotsRoute = { name: "list" } | { name: "detail" };

export type Editor =
  | { kind: "none" }
  | { kind: "template"; id: string; name: string; presetId: string }
  | {
      kind: "bot";
      id: string;
      name: string;
      templateId: string;
      workspace: string;
      defaultModel: string;
    };

const opened = openRepository();
const repo = opened.repo;

export const botsNav = createNavStack<BotsRoute>([{ name: "list" }]);
export const registry = signal<BotRegistry>(emptyRegistry());
export const editor = signal<Editor>({ kind: "none" });
export const ready = signal(false);
export const saving = signal(false);
export const loadError = signal<string | null>(null);
export const actionError = signal<string | null>(null);
export const persistenceNotice = signal<string | null>(opened.notice);

export async function loadRegistry(): Promise<void> {
  try {
    const result = await repo.load();
    registry.set(result.registry);
    loadError.set(result.corrupt);
  } catch (error) {
    loadError.set(messageOf(error));
  } finally {
    ready.set(true);
  }
}

export function beginTemplate(): void {
  if (!canWrite()) return;
  editor.set({ kind: "template", id: "new", name: "", presetId: "" });
  actionError.set(null);
  showDetail();
}

export function editTemplate(id: string): void {
  const template = untracked(registry).templates.find((item) => item.id === id);
  if (!template) return;
  editor.set({
    kind: "template",
    id: template.id,
    name: template.name,
    presetId: template.presetId,
  });
  actionError.set(null);
  showDetail();
}

export function beginBot(): void {
  if (!canWrite()) return;
  const templates = untracked(registry).templates;
  const template = templates[0];
  if (!template) return;
  editor.set({
    kind: "bot",
    id: "new",
    name: "",
    templateId: template.id,
    workspace: "",
    defaultModel: "",
  });
  actionError.set(null);
  showDetail();
}

export function editBot(id: string): void {
  const bot = untracked(registry).bots.find((item) => item.id === id);
  if (!bot) return;
  editor.set({
    kind: "bot",
    id: bot.id,
    name: bot.name,
    templateId: bot.templateId,
    workspace: bot.workspace,
    defaultModel: bot.defaultModel ?? "",
  });
  actionError.set(null);
  showDetail();
}

export function setEditorName(name: string): void {
  editor.update((current) => (current.kind === "none" ? current : { ...current, name }));
}

export function setEditorPreset(presetId: string): void {
  editor.update((current) => (current.kind === "template" ? { ...current, presetId } : current));
}

export function setEditorTemplate(templateId: string): void {
  editor.update((current) => {
    if (current.kind !== "bot") return current;
    const bot = untracked(registry).bots.find((item) => item.id === current.id);
    if (bot?.status === "ready") return current;
    return { ...current, templateId };
  });
}

export function setEditorWorkspace(workspace: string): void {
  editor.update((current) => {
    if (current.kind !== "bot") return current;
    const bot = untracked(registry).bots.find((item) => item.id === current.id);
    if (bot?.status === "ready") return current;
    return { ...current, workspace };
  });
}

export function setEditorModel(defaultModel: string): void {
  editor.update((current) => (current.kind === "bot" ? { ...current, defaultModel } : current));
}

export async function saveEditor(): Promise<void> {
  const current = untracked(editor);
  if (current.kind === "none" || !canWrite()) return;
  const next = await commit((reg) =>
    current.kind === "template" ? applyTemplate(reg, current) : applyBot(reg, current),
  );
  if (!next) return;
  if (current.kind === "template") {
    const saved =
      current.id === "new"
        ? next.templates[next.templates.length - 1]
        : findTemplate(next, current.id);
    if (saved) {
      editor.set({ kind: "template", id: saved.id, name: saved.name, presetId: saved.presetId });
    }
    return;
  }
  const saved = current.id === "new" ? next.bots[next.bots.length - 1] : findBot(next, current.id);
  if (saved) syncBot(saved);
}

export async function initializeEditor(): Promise<void> {
  const current = untracked(editor);
  if (current.kind !== "bot" || !canWrite()) return;
  const next = await commit((reg) => {
    const drafted = applyBot(reg, current);
    return initializeBot(drafted, botIdAfter(drafted, current));
  });
  if (!next) return;
  const saved = current.id === "new" ? next.bots[next.bots.length - 1] : findBot(next, current.id);
  if (saved) syncBot(saved);
}

export async function removeTemplate(): Promise<void> {
  const current = untracked(editor);
  if (current.kind !== "template" || current.id === "new" || !canWrite()) return;
  const id = current.id;
  const next = await commit((reg) => deleteTemplate(reg, id));
  if (!next) return;
  closeDetail();
}

export function closeDetail(): void {
  editor.set({ kind: "none" });
  actionError.set(null);
  if (untracked(isDesktopLayout)) return;
  const top = untracked(botsNav.routes).at(-1);
  if (top?.name === "detail") botsNav.pop();
}

export function onDetailDismiss(): void {
  editor.set({ kind: "none" });
  actionError.set(null);
}

export function resetBotsNavigation(): void {
  editor.set({ kind: "none" });
  actionError.set(null);
  botsNav.setRoutes([{ name: "list" }]);
  setModuleAtRoot(true);
}

function showDetail(): void {
  if (untracked(isDesktopLayout)) return;
  const top = untracked(botsNav.routes).at(-1);
  if (top?.name === "detail") return;
  botsNav.push({ name: "detail" });
}

function canWrite(): boolean {
  return untracked(ready) && untracked(loadError) === null && !untracked(saving);
}

async function commit(change: (registry: BotRegistry) => BotRegistry): Promise<BotRegistry | null> {
  if (!canWrite()) return null;
  saving.set(true);
  actionError.set(null);
  try {
    const next = await repo.commit(change);
    registry.set(next);
    return next;
  } catch (error) {
    actionError.set(messageOf(error));
    return null;
  } finally {
    saving.set(false);
  }
}

function applyTemplate(
  reg: BotRegistry,
  current: Extract<Editor, { kind: "template" }>,
): BotRegistry {
  if (current.id === "new") {
    return createTemplate(reg, { name: current.name, presetId: current.presetId });
  }
  return updateTemplate(reg, current.id, { name: current.name, presetId: current.presetId });
}

function applyBot(reg: BotRegistry, current: Extract<Editor, { kind: "bot" }>): BotRegistry {
  const input = {
    name: current.name,
    templateId: current.templateId,
    workspace: current.workspace,
    defaultModel: current.defaultModel.trim() ? current.defaultModel : null,
  };
  if (current.id === "new") return createBot(reg, input);
  return updateBot(reg, current.id, input);
}

function botIdAfter(reg: BotRegistry, current: Extract<Editor, { kind: "bot" }>): string {
  if (current.id !== "new") return current.id;
  const created = reg.bots[reg.bots.length - 1];
  if (!created) throw new RegistryRejection({ code: "not-found", kind: "bot", id: "new" });
  return created.id;
}

function syncBot(bot: BotRegistry["bots"][number]): void {
  editor.set({
    kind: "bot",
    id: bot.id,
    name: bot.name,
    templateId: bot.templateId,
    workspace: bot.workspace,
    defaultModel: bot.defaultModel ?? "",
  });
}

function findTemplate(reg: BotRegistry, id: string) {
  return reg.templates.find((item) => item.id === id);
}

function findBot(reg: BotRegistry, id: string) {
  return reg.bots.find((item) => item.id === id);
}

function messageOf(error: unknown): string {
  if (error instanceof RegistryRejection) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "保存失败。";
}

function openRepository(): { repo: BotRegistryRepository; notice: string | null } {
  const desktop = platform.os === "macos" || platform.os === "windows" || platform.os === "linux";
  if (!desktop) {
    return {
      repo: new BotRegistryRepository(memoryStore()),
      notice: "当前平台不写入 ~/.myaid，更改只留在这次会话。",
    };
  }
  return { repo: new BotRegistryRepository(fileStore(defaultRegistryPath())), notice: null };
}
