import fs from "fs/promises";
import { dirname } from "path";

import { Storage } from "nsh";

import { registryPath } from "../../lib/data-root";
import {
  emptyRegistry,
  parseRegistry,
  RegistryRejection,
  serializeRegistry,
  type BotRegistry,
  type LegacyRegistry,
} from "./model";
import { isRecord } from "./registry";

/**
 * Missing file reads as `null`. Any other failure rejects. Corrupt text is left
 * for the repository. `backup` keeps the pre-migration text beside the file
 * under the store's own name.
 */
export interface RegistryStore {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
  /** Keep the pre-migration text; `version` names the file (`v5.bak`). */
  backup?(text: string, version: string): Promise<void>;
}

export function memoryStore(initial: string | null = null): RegistryStore & {
  text(): string | null;
  backupText(): string | null;
} {
  let text = initial;
  let backup: string | null = null;
  return {
    async read() {
      return text;
    },
    async write(next) {
      text = next;
    },
    async backup(previous) {
      backup = previous;
    },
    text() {
      return text;
    },
    backupText() {
      return backup;
    },
  };
}

/** Where a platform without a desktop profile (the web build, phones) keeps the registry. */
export const REGISTRY_STORAGE_KEY = "dsh-bot.registry.bots";

/** The app's key-value storage, for platforms with no `~/.dsh-bot`. */
export function storageStore(key: string = REGISTRY_STORAGE_KEY): RegistryStore {
  return {
    read: () => Storage.getItem(key),
    write: (text) => Storage.setItem(key, text),
    backup: (text, version) => Storage.setItem(`${key}.${version}.bak`, text),
  };
}

/** `~/.dsh-bot/registry/bots.json` (templates + bots + their segments). Beside the dsh profile, not inside a preset patch. */
export function defaultRegistryPath(): string {
  return registryPath();
}

export function fileStore(path: string): RegistryStore {
  return {
    async read() {
      try {
        return await fs.readFile(path, "utf8");
      } catch (error) {
        if (errorCode(error) === "ENOENT") return null;
        throw error;
      }
    },
    async write(text) {
      await fs.mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.tmp`;
      await fs.writeFile(temporary, text);
      await fs.rename(temporary, path);
    },
    async backup(text, version) {
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(`${path}.${version}.bak`, text);
    },
  };
}

export type RegistrySnapshot = {
  registry: BotRegistry;
  /** An old file, read whole: its Dialogues need a Host before v6. */
  legacy: LegacyRegistry | null;
  /** Set when the file is present but unreadable. The file is left untouched. */
  corrupt: string | null;
};

export class BotRegistryRepository {
  private tail: Promise<void> = Promise.resolve();
  private registry: BotRegistry = emptyRegistry();
  private legacy: LegacyRegistry | null = null;
  private corrupt: string | null = null;
  private loaded = false;

  constructor(private readonly store: RegistryStore) {}

  load(): Promise<RegistrySnapshot> {
    return this.enqueue(async () => {
      await this.readState();
      this.loaded = true;
      return this.snapshot();
    });
  }

  /** Apply `change` and write it. A rejection or a corrupt file writes nothing. */
  commit(change: (registry: BotRegistry) => BotRegistry): Promise<BotRegistry> {
    return this.enqueue(async () => {
      if (!this.loaded) {
        await this.readState();
        this.loaded = true;
      }
      if (this.corrupt) throw new RegistryRejection({ code: "corrupt" });
      if (this.legacy) throw new RegistryRejection({ code: "legacy-version" });
      const next = change(this.registry);
      await this.store.write(serializeRegistry(next));
      this.registry = next;
      return next;
    });
  }

  /**
   * Replace the whole file with a migrated v5 registry. The pre-migration
   * text is backed up first, so a failed migration leaves v4 readable.
   */
  replace(registry: BotRegistry): Promise<BotRegistry> {
    return this.enqueue(async () => {
      if (!this.loaded) {
        await this.readState();
        this.loaded = true;
      }
      if (this.corrupt) throw new RegistryRejection({ code: "corrupt" });
      if (this.legacy) {
        const text = await this.store.read();
        const version = `v${this.legacy.version}`;
        if (text !== null) await this.store.backup?.(text, version);
      }
      await this.store.write(serializeRegistry(registry));
      this.registry = registry;
      this.legacy = null;
      return registry;
    });
  }

  private async readState(): Promise<void> {
    const text = await this.store.read();
    if (text === null) {
      this.registry = emptyRegistry();
      this.legacy = null;
      this.corrupt = null;
      return;
    }
    const parsed = parseRegistry(text);
    if (!parsed.ok) {
      // The file may have been readable before (a bad edit, a partial write):
      // drop the previous snapshot so nothing reads a registry that is gone.
      this.registry = emptyRegistry();
      this.legacy = null;
      this.corrupt = parsed.message;
      return;
    }
    if (parsed.state === "legacy") {
      this.registry = emptyRegistry();
      this.legacy = parsed.legacy;
      this.corrupt = null;
      return;
    }
    this.registry = parsed.registry;
    this.legacy = null;
    this.corrupt = null;
  }

  private snapshot(): RegistrySnapshot {
    return { registry: this.registry, legacy: this.legacy, corrupt: this.corrupt };
  }

  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.tail.then(job, job);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function errorCode(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
