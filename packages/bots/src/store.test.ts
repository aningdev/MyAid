import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { MAIN_BOT_ID } from "./registry.ts";
import { BotsRegistryStore } from "./store.ts";

const preset = { id: "standard", name: "Standard" };
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function root(): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), "bots-store-"));
  tempDirs.push(dir);
  return { dir, file: join(dir, "bots", "registry.json") };
}

function store(paths: { file: string }): BotsRegistryStore {
  return new BotsRegistryStore({
    file: paths.file,
    defaultPreset: async () => preset,
  });
}

describe("Registry store", () => {
  it("creates a Registry with only the Main Bot on a fresh root", async () => {
    const paths = await root();
    const current = store(paths);
    await current.load();
    const snapshot = await current.snapshot();
    expect(snapshot.revision).toBe(0);
    expect(snapshot.registry.bots.map((bot) => bot.id)).toEqual([MAIN_BOT_ID]);
    const written = JSON.parse(await readFile(paths.file, "utf8"));
    expect(written.version).toBe(6);
    expect(written.revision).toBe(0);
  });

  it("increments the revision on every write and notifies watchers", async () => {
    const paths = await root();
    const current = store(paths);
    await current.load();
    const seen: number[] = [];
    current.subscribe(() => {
      seen.push(1);
    });
    const first = await current.write((registry) => registry);
    const second = await current.write((registry) => registry);
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(await current.snapshot()).toMatchObject({ revision: 2 });
    expect(seen).toHaveLength(2);
    expect(JSON.parse(await readFile(paths.file, "utf8")).revision).toBe(2);
  });

  it("serializes concurrent writes so revisions never repeat", async () => {
    const paths = await root();
    const current = store(paths);
    const results = await Promise.all([
      current.write((registry) => registry),
      current.write((registry) => registry),
      current.write((registry) => registry),
    ]);
    expect(results.map((result) => result.revision)).toEqual([1, 2, 3]);
  });
});
