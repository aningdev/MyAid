/**
 * The Registry signal follows the `bots` gateway: a write applies the snapshot
 * that comes back, and `watch` applies a snapshot another Device published.
 */
import { expect, test } from "nsh/test";

import { botRows } from "../../components/shell/botList";
import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
} from "../../test/bots-fixture";
import { workspaceProjection } from "../../test/workspaces";
import { workspaces } from "../workspace/state";
import { createMemoryBots } from "./memory";
import type { BotRegistry } from "./model";
import {
  actionError,
  followBots,
  ready,
  registry,
  stopBots,
  updateBot,
  useMemoryBots,
} from "./state";

function ada(): BotRegistry {
  return initializeBot(
    createBot(
      createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
      { name: "Ada", templateId: "tmpl" },
      "ada",
    ),
    "ada",
  );
}

function claimed(): BotRegistry {
  return claimSegment(ada(), "ada", "s-ada", "ws-ada");
}

async function until(ready: () => boolean): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if (ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for the Registry");
}

function reset(): void {
  stopBots();
  registry.set(emptyRegistry());
  workspaces.set(workspaceProjection());
  actionError.set(null);
}

test("a write shows the snapshot the gateway returned", async () => {
  await useMemoryBots(ada());
  try {
    expect(await updateBot("ada", { name: "Ada L" })).toBe(true);
    expect(registry().bots[0]?.name).toBe("Ada L");
    expect(actionError()).toBeNull();
  } finally {
    reset();
  }
});

test("a watch snapshot renames a Bot in the Navigator list without a reload", async () => {
  const seed = claimed();
  const memory = createMemoryBots(seed);
  await followBots(memory);
  try {
    expect(botRows().others.map((row) => row.bot.name)).toEqual(["Ada"]);
    memory.publish({
      ...seed,
      bots: seed.bots.map((bot) => (bot.id === "ada" ? { ...bot, name: "Ada L" } : bot)),
    });
    await until(() => registry().bots.find((bot) => bot.id === "ada")?.name === "Ada L");
    expect(botRows().others.map((row) => row.bot.name)).toEqual(["Ada L"]);
    expect(ready()).toBe(true);
  } finally {
    reset();
  }
});

test("a RemoteError is the action notice", async () => {
  const memory = createMemoryBots(ada());
  const remote = new Error("bots/invalid: The name is empty.");
  Object.assign(remote, { isDSHRemoteError: true, code: "bots/invalid" });
  memory.updateBot = async () => {
    throw remote;
  };
  await followBots(memory);
  try {
    expect(await updateBot("ada", { name: "Ada L" })).toBe(false);
    expect(actionError()).toBe("bots/invalid: The name is empty.");
    expect(registry().bots[0]?.name).toBe("Ada");
  } finally {
    reset();
  }
});

test("an older snapshot does not replace a newer Registry", async () => {
  const seed = ada();
  const renamed = {
    ...seed,
    bots: seed.bots.map((bot) => ({ ...bot, name: "Ada L" })),
  };
  const memory = createMemoryBots(seed);
  memory.watch = async function* watch() {
    yield { registry: renamed, revision: 2 };
    yield { registry: seed, revision: 1 };
  };
  await followBots(memory);
  try {
    await until(() => registry().bots[0]?.name === "Ada L");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(registry().bots[0]?.name).toBe("Ada L");
  } finally {
    reset();
  }
});

test("dropping the subscription leaves the Registry unloaded", async () => {
  await useMemoryBots(ada());
  expect(ready()).toBe(true);
  stopBots();
  expect(ready()).toBe(false);
  registry.set(emptyRegistry());
});
