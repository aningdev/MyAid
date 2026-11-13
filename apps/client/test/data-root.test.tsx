/**
 * Guard: a test app writes its registry and shell prefs to the storage `open`
 * gave it. If the test marker or this helper regresses, the app falls back to
 * the real `~/.myaid` and these two keys stay at their seeded/absent state.
 */
import { expect, test } from "nsh/test";

import { SHELL_PREFS_STORAGE } from "../components/shell/prefs";
import { createTemplate, emptyRegistry, serializeRegistry } from "../features/bots/model";
import { REGISTRY_STORAGE_KEY } from "../features/bots/store";
import { open } from "./open";

test("a test app keeps registry and prefs in its isolated storage", async () => {
  const template = createTemplate(
    emptyRegistry(),
    { name: "Coding", presetId: "standard" },
    "tmpl",
  );
  const app = await open("../App.tsx", {
    width: 1200,
    height: 860,
    storage: { [REGISTRY_STORAGE_KEY]: serializeRegistry(template) },
  });

  await app.waitFor("label:New Bot");
  await app.press("label:New Bot");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Hermetic");
  await app.type("id:new-bot-workspace", "/tmp");
  await app.press("label:Create Bot");
  await app.waitUntil(() => (app.storage()[REGISTRY_STORAGE_KEY] ?? "").includes("Hermetic"), {
    timeout: 20000,
  });

  await app.press("label:Collapse navigator");
  await app.waitUntil(() => (app.storage()[SHELL_PREFS_STORAGE] ?? "").includes('"open": false'), {
    timeout: 5000,
  });
  expect(app.storage()[REGISTRY_STORAGE_KEY] ?? "").not.toBe(serializeRegistry(template));
}, 60000);
