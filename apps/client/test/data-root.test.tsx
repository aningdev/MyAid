/**
 * Guard: a test app writes its bots fixture and shell prefs to the storage
 * `open` gave it. If the test marker or this helper regresses, the app falls
 * back to the real `~/.dsh-bot` and these two keys stay at their seeded state.
 */
import { homedir } from "os";
import { join } from "path";

import { expect, test } from "nsh/test";

import { SHELL_PREFS_STORAGE } from "../components/shell/prefs";
import { emptyRegistry } from "../features/bots/model";
import { dataRootPath } from "../lib/data-root";
import { BOTS_FIXTURE_KEY, botsStorage, createTemplate } from "./bots-fixture";
import { open } from "./open";

test("a test app keeps the bots fixture and prefs in its isolated storage", async () => {
  const template = createTemplate(
    emptyRegistry(),
    { name: "Coding", presetId: "standard" },
    "tmpl",
  );
  const app = await open("../App.tsx", {
    platform: "macos",
    width: 1200,
    height: 860,
    clock: {},
    storage: { ...botsStorage(template) },
  });

  await app.waitFor("label:New Bot");
  await app.press("label:New Bot");
  await app.waitFor("id:new-bot-dialog");
  await app.type("id:new-bot-name", "Hermetic");
  await app.type("id:new-bot-workspace", "/tmp");
  await app.press("label:Create Bot");
  await app.waitUntil(() => (app.storage()[BOTS_FIXTURE_KEY] ?? "").includes("Hermetic"), {
    timeout: 20000,
  });

  await app.press("label:Collapse navigator");
  await app.waitUntil(() => (app.storage()[SHELL_PREFS_STORAGE] ?? "").includes('"open": false'), {
    timeout: 5000,
  });
  expect(app.storage()[BOTS_FIXTURE_KEY] ?? "").not.toBe(JSON.stringify(template));
}, 60000);

test("DSH_BOT_HOME is the data root prefs and the Host share", () => {
  const isolated = join(homedir(), ".dsh-bot-dev", "probe");
  expect(dataRootPath(isolated)).toBe(isolated);
  expect(dataRootPath(`  ${isolated}  `)).toBe(isolated);
  expect(dataRootPath("")).toBe(join(homedir(), ".dsh-bot"));
  expect(dataRootPath(undefined)).toBe(join(homedir(), ".dsh-bot"));
});
