/**
 * The Registry file: one JSON document under the plugin's data root, written
 * atomically, with a monotonic revision and change notification for watchers.
 *
 * A fresh data root gets a new Registry with only the Main Bot. Nothing is
 * imported: the project has never shipped, so there is no older data to carry.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  ensureMainBot,
  emptyRegistry,
  registryFileSchema,
  type BotRegistry,
  type DefaultPreset,
  type RegistryFile,
} from "./registry.ts";

/** What a Registry read or write returns across the Remote. */
export type BotsSnapshot = { registry: BotRegistry; revision: number };

/** A watcher is told after every successful write; it reads the snapshot itself. */
export type BotsWatcher = () => void;

export type BotsStoreOptions = {
  /** This plugin's own Registry file. */
  file: string;
  /** Default Agent preset for the Main Bot. */
  defaultPreset: () => Promise<DefaultPreset>;
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

  /** Read the file, or start a new Registry with the Main Bot. */
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

    const registry = ensureMainBot(emptyRegistry(), preset);
    this.state = { ...registry, revision: 0 };
    await this.persist(this.state);
    this.notify();
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
