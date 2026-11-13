/**
 * Bots store: the desktop registry, readable and writable from any Panel.
 * Bot / segment / Session views are panels in the Workspace Shell; this
 * module owns the file and the one in-flight write, not any view state.
 */
import { platform, signal, untracked } from "nsh";

import { usesTestStorage } from "../../lib/data-root";
import {
  DERIVED_PRESET_PREFIX,
  emptyRegistry,
  importTemplatesFromPresets,
  RegistryRejection,
  type BotRegistry,
  type LegacyRegistry,
} from "./model";
import { BotRegistryRepository, defaultRegistryPath, fileStore, storageStore } from "./store";

/** The desktop file where there is one; the app's storage on the web and on phones. */
const opened = openRepository();
const repo = opened.repo;

export const registry = signal<BotRegistry>(emptyRegistry());
/**
 * A v3 / v4 / v5 file: Dialogues that still own the conversation. It is read-only until a
 * Host is up and the migration writes v5; nothing writes the old shape.
 */
export const legacyRegistry = signal<LegacyRegistry | null>(null);
/** Why the v4 file has not migrated yet (no Host, or a failing step). */
export const migrationNotice = signal<string | null>(null);
export const ready = signal(false);
export const saving = signal(false);
export const loadError = signal<string | null>(null);
export const actionError = signal<string | null>(null);
export const persistenceNotice = signal<string | null>(opened.notice);

export async function loadRegistry(): Promise<void> {
  try {
    const result = await repo.load();
    registry.set(result.registry);
    legacyRegistry.set(result.legacy);
    loadError.set(result.corrupt);
    migrationNotice.set(
      result.legacy
        ? `注册表还是旧版本（v${result.legacy.version}）：连接 Host 后会把旧对话并成 Bot 的一条长对话。`
        : null,
    );
  } catch (error) {
    loadError.set(messageOf(error));
  } finally {
    ready.set(true);
  }
}

/**
 * Store a migrated v5 registry (the v4 file is backed up first). Returns false
 * when the write failed; the v4 file then stays the only copy.
 */
export async function acceptMigratedRegistry(next: BotRegistry): Promise<boolean> {
  if (loadError() !== null) return false;
  saving.set(true);
  try {
    await repo.replace(next);
    registry.set(next);
    legacyRegistry.set(null);
    migrationNotice.set(null);
    return true;
  } catch (error) {
    migrationNotice.set(`迁移结果没能写入：${messageOf(error)}`);
    return false;
  } finally {
    saving.set(false);
  }
}

/** True when a write would not go through (still loading, unreadable or v4 file, another write). */
export function writeBlocked(): boolean {
  return !ready() || loadError() !== null || legacyRegistry() !== null || saving();
}

export function clearActionError(): void {
  actionError.set(null);
}

export function setActionError(message: string | null): void {
  actionError.set(message);
}

/** Apply `change` and write it. A rejection or a corrupt file changes nothing. */
export async function changeRegistry(
  change: (registry: BotRegistry) => BotRegistry,
): Promise<BotRegistry | null> {
  if (writeBlocked()) return null;
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

/** Connect dsh if needed and upsert its agent presets as templates. */
export async function importDshTemplates(): Promise<number> {
  if (writeBlocked()) return 0;
  saving.set(true);
  actionError.set(null);
  try {
    const api = await import("../../lib/dsh/session");
    const connection = await api.ensureConnected();
    const presets = (await api.listAgentPresets(connection)).filter(
      (preset) => !preset.id.startsWith(DERIVED_PRESET_PREFIX),
    );
    const before = untracked(registry).templates.length;
    const next = await repo.commit((reg) => importTemplatesFromPresets(reg, presets));
    registry.set(next);
    return Math.max(0, next.templates.length - before);
  } catch (error) {
    try {
      const { readableError } = await import("../../lib/dsh/session");
      actionError.set(readableError(error));
    } catch {
      actionError.set(messageOf(error));
    }
    return 0;
  } finally {
    saving.set(false);
  }
}

function messageOf(error: unknown): string {
  if (error instanceof RegistryRejection) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "保存失败。";
}

function openRepository(): { repo: BotRegistryRepository; notice: string | null } {
  const desktop = platform.os === "macos" || platform.os === "windows" || platform.os === "linux";
  if (!desktop || usesTestStorage()) {
    return {
      repo: new BotRegistryRepository(storageStore()),
      notice: desktop ? null : "当前平台不写 ~/.myaid，注册表存在应用自己的存储里。",
    };
  }
  return { repo: new BotRegistryRepository(fileStore(defaultRegistryPath())), notice: null };
}
