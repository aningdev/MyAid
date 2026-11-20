/**
 * The Registry file: one JSON document under the plugin's data root, written
 * atomically, with a monotonic revision and change notification for watchers.
 *
 * Import of the Client's old `registry/bots.json` happens exactly once, on the
 * first start that finds this plugin's own file absent. A file that is not v6
 * is left untouched; no older format is ever migrated.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  ensureMainBot,
  emptyRegistry,
  REGISTRY_VERSION,
  registryFileSchema,
  registrySchema,
  type BotRegistry,
  type DefaultPreset,
  type RegistryFile,
} from "./registry.ts";

/** What a Registry read or write returns across the Remote. */
export type BotsSnapshot = { registry: BotRegistry; revision: number };

/** A watcher is told after every successful write; it reads the snapshot itself. */
export type BotsWatcher = () => void;

export type StoreLogger = {
  info(message: string): void;
  warn(message: string): void;
};

export type BotsStoreOptions = {
  /** This plugin's own Registry file. */
  file: string;
  /** The Client's old Registry, imported once then renamed. */
  legacyFile: string;
  /** Default Agent preset for the Main Bot. */
  defaultPreset: () => Promise<DefaultPreset>;
  logger: StoreLogger;
};

export class BotsRegistryStore {
  private state: RegistryFile | undefined;
  private loading: Promise<void> | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly watchers = new Set<BotsWatcher>();
  private readonly options: BotsStoreOptions;

  constructor(options: BotsStoreOptions) {
    this.options = options;
  }

  /** Read the file, import a v6 legacy Registry, and ensure the Main Bot. */
  load(): Promise<void> {
    this.loading ??= this.read();
    return this.loading;
  }

  async snapshot(): Promise<BotsSnapshot> {
    await this.load();
    return this.current();
  }

  /**
   * Apply one pure Registry write. Writes serialize on one tail so revision,
   * file content and watcher order cannot interleave.
   */
  write(change: (registry: BotRegistry) => BotRegistry): Promise<BotsSnapshot> {
    const next = this.tail.then(async () => {
      await this.load();
      const state = this.current();
      const registry = change(state.registry);
      const written: RegistryFile = { ...registry, revision: state.revision + 1 };
      await this.persist(written);
      this.state = written;
      this.notify();
      return this.current();
    });
    this.tail = next.catch(() => undefined);
    return next;
  }

  /** Called after every successful write; returns the unsubscribe. */
  subscribe(watcher: BotsWatcher): () => void {
    this.watchers.add(watcher);
    return () => {
      this.watchers.delete(watcher);
    };
  }

  private current(): BotsSnapshot {
    if (this.state === undefined) throw new Error("bots: Registry 尚未加载。");
    const { revision, ...registry } = this.state;
    return { registry, revision };
  }

  private async read(): Promise<void> {
    const own = await readOptional(this.options.file);
    const preset = await this.options.defaultPreset();
    if (own !== null) {
      const parsed = registryFileSchema.safeParse(parseJson(own));
      if (!parsed.success) {
        throw new Error(
          `bots: Registry 文件 ${this.options.file} 无法解析：${parsed.error.issues[0]?.message ?? "未知格式"}`,
        );
      }
      const { revision: storedRevision, ...stored } = parsed.data;
      const registry = ensureMainBot(stored, preset);
      if (JSON.stringify(registry) === JSON.stringify(stored)) {
        this.state = { ...registry, revision: storedRevision };
        return;
      }
      this.state = { ...registry, revision: storedRevision + 1 };
      await this.persist(this.state);
      this.notify();
      return;
    }

    const { registry: imported, present } = await this.importLegacy();
    const registry = ensureMainBot(imported, preset);
    this.state = { ...registry, revision: present ? 1 : 0 };
    await this.persist(this.state);
    this.notify();
    if (present) await this.renameLegacy();
  }

  /** The old file's Bots, or an empty Registry; never mutates the old file. */
  private async importLegacy(): Promise<{ registry: BotRegistry; present: boolean }> {
    const text = await readOptional(this.options.legacyFile);
    if (text === null) return { registry: emptyRegistry(), present: false };
    const value = parseJson(text);
    const version =
      typeof value === "object" && value !== null && "version" in value
        ? (value as { version?: unknown }).version
        : undefined;
    if (version !== REGISTRY_VERSION) {
      this.options.logger.warn(
        `bots: 旧 Registry ${this.options.legacyFile} 的版本是 ${String(version)}，不是 v${REGISTRY_VERSION}；保持原样，未导入。`,
      );
      return { registry: emptyRegistry(), present: false };
    }
    const parsed = registrySchema.safeParse(value);
    if (!parsed.success) {
      this.options.logger.warn(
        `bots: 旧 Registry ${this.options.legacyFile} 是 v${REGISTRY_VERSION} 但内容无法解析（${parsed.error.issues[0]?.message ?? "未知格式"}）；保持原样，未导入。`,
      );
      return { registry: emptyRegistry(), present: false };
    }
    this.options.logger.info(
      `bots: 已从 ${this.options.legacyFile} 导入 ${parsed.data.bots.length} 个 Bot。`,
    );
    return { registry: parsed.data, present: true };
  }

  private async renameLegacy(): Promise<void> {
    const imported = `${this.options.legacyFile}.imported`;
    await rename(this.options.legacyFile, imported);
    this.options.logger.info(`bots: 旧 Registry 已改名为 ${imported}。`);
  }

  private async persist(state: RegistryFile): Promise<void> {
    await mkdir(dirname(this.options.file), { recursive: true });
    const temporary = `${this.options.file}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await rename(temporary, this.options.file);
  }

  private notify(): void {
    for (const watcher of this.watchers) watcher();
  }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
