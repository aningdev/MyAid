import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { MAIN_BOT_ID, type BotRegistry } from "./registry.ts";
import { BotsRegistryStore, type StoreLogger } from "./store.ts";

const preset = { id: "standard", name: "Standard" };
const tempDirs: string[] = [];
const messages: { level: "info" | "warn"; message: string }[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  messages.length = 0;
});

const logger: StoreLogger = {
  info: (message) => messages.push({ level: "info", message }),
  warn: (message) => messages.push({ level: "warn", message }),
};

async function root(): Promise<{ dir: string; file: string; legacy: string }> {
  const dir = await mkdtemp(join(tmpdir(), "bots-store-"));
  tempDirs.push(dir);
  return {
    dir,
    file: join(dir, "bots", "registry.json"),
    legacy: join(dir, "registry", "bots.json"),
  };
}

function store(paths: { file: string; legacy: string }): BotsRegistryStore {
  return new BotsRegistryStore({
    file: paths.file,
    legacyFile: paths.legacy,
    defaultPreset: async () => preset,
    logger,
  });
}

function legacyRegistry(): BotRegistry {
  return {
    version: 6,
    templates: [{ id: "standard", name: "Standard", presetId: "standard" }],
    bots: [
      {
        id: "bot-ada",
        name: "Ada",
        description: null,
        templateId: "standard",
        defaultModel: null,
        defaultThinking: null,
        defaultWorkspacePath: null,
        hadDialogue: false,
        status: "ready",
        boundPresetId: "standard",
        derivedPresetId: null,
        archived: false,
        identity: { color: "sky", shape: "pebble", face: "happy" },
        segments: [],
      },
    ],
  };
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

  it("imports a v6 Registry once and renames the old file", async () => {
    const paths = await root();
    await mkdir(join(paths.dir, "registry"), { recursive: true });
    await writeFile(paths.legacy, JSON.stringify(legacyRegistry()), "utf8");
    const current = store(paths);
    await current.load();
    const snapshot = await current.snapshot();
    expect(snapshot.registry.bots.map((bot) => bot.id)).toEqual([MAIN_BOT_ID, "bot-ada"]);
    expect(snapshot.revision).toBe(1);
    expect(await readFile(`${paths.legacy}.imported`, "utf8")).toContain("bot-ada");
    await expect(readFile(paths.legacy, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("leaves a non-v6 Registry untouched and never imports it", async () => {
    const paths = await root();
    const old = { version: 3, dialogues: [] };
    await mkdir(join(paths.dir, "registry"), { recursive: true });
    await writeFile(paths.legacy, JSON.stringify(old), "utf8");
    const current = store(paths);
    await current.load();
    const snapshot = await current.snapshot();
    expect(snapshot.registry.bots.map((bot) => bot.id)).toEqual([MAIN_BOT_ID]);
    expect(JSON.parse(await readFile(paths.legacy, "utf8"))).toEqual(old);
    expect(
      messages.some((message) => message.level === "warn" && message.message.includes("版本是 3")),
    ).toBe(true);
  });

  it("does not read the old file after the first start", async () => {
    const paths = await root();
    await mkdir(join(paths.dir, "registry"), { recursive: true });
    await writeFile(paths.legacy, JSON.stringify(legacyRegistry()), "utf8");
    await store(paths).load();
    await mkdir(join(paths.dir, "registry"), { recursive: true });
    await writeFile(paths.legacy, JSON.stringify(legacyRegistry()), "utf8");
    const restarted = store(paths);
    await restarted.load();
    const snapshot = await restarted.snapshot();
    expect(snapshot.registry.bots.map((bot) => bot.id)).toEqual([MAIN_BOT_ID, "bot-ada"]);
  });
});
