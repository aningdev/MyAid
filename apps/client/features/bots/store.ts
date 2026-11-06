import fs from "fs/promises";
import { homedir } from "os";
import { dirname, join } from "path";

import {
  emptyRegistry,
  parseRegistry,
  RegistryRejection,
  serializeRegistry,
  type BotRegistry,
} from "./model";

/** Missing file reads as `null`. Any other failure rejects. Corrupt text is left for the repository. */
export interface RegistryStore {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

export function memoryStore(initial: string | null = null): RegistryStore & {
  text(): string | null;
} {
  let text = initial;
  return {
    async read() {
      return text;
    },
    async write(next) {
      text = next;
    },
    text() {
      return text;
    },
  };
}

/** `~/.myaid/registry/bots.json` (v3: templates + bots + dialogues). Beside the dsh profile, not inside a preset patch. */
export function defaultRegistryPath(): string {
  return join(homedir(), ".myaid", "registry", "bots.json");
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
  };
}

export type RegistrySnapshot = {
  registry: BotRegistry;
  /** Set when the file is present but unreadable as version 1. The file is left untouched. */
  corrupt: string | null;
};

export class BotRegistryRepository {
  private tail: Promise<void> = Promise.resolve();
  private registry: BotRegistry = emptyRegistry();
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
      const next = change(this.registry);
      await this.store.write(serializeRegistry(next));
      this.registry = next;
      return next;
    });
  }

  private async readState(): Promise<void> {
    const text = await this.store.read();
    if (text === null) {
      this.registry = emptyRegistry();
      this.corrupt = null;
      return;
    }
    const parsed = parseRegistry(text);
    if (!parsed.ok) {
      this.corrupt = parsed.message;
      return;
    }
    this.registry = parsed.registry;
    this.corrupt = null;
  }

  private snapshot(): RegistrySnapshot {
    return { registry: this.registry, corrupt: this.corrupt };
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
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
