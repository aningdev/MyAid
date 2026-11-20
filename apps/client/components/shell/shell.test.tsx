/**
 * Shell × features: the Navigator is the registry's flat projection, and a
 * press opens that Bot's conversation in a Pane. The registry is seeded
 * through the app's storage (the web target's store), so the test needs no
 * Host and writes nothing.
 */
import { expect, test } from "nsh/test";

import { emptyRegistry, type BotRegistry } from "../../features/bots/model";
import {
  botsStorage,
  claimSegment,
  createBot,
  createTemplate,
  initializeBot,
} from "../../test/bots-fixture";
import { open } from "../../test/open";
import { workspaceStorage, workspaceRow } from "../../test/workspaces";

const desktop = { platform: "macos" as const, width: 1100, height: 800 };

/** The app's start, with `registry` already on disk. */
function start(registry: BotRegistry) {
  return open("../../App.tsx", {
    ...desktop,
    storage: {
      ...botsStorage(registry),
      ...workspaceStorage({
        rows: [
          workspaceRow({
            id: "ws-work",
            path: "/work/dsh-bot",
            title: "dsh-bot",
            sessionIds: ["s1"],
          }),
        ],
      }),
    },
  });
}

/** Ada (ready) → one segment at /work/dsh-bot. */
function sampleRegistry(): BotRegistry {
  return claimSegment(
    initializeBot(
      createBot(
        createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl"),
        { name: "Ada", templateId: "tmpl" },
        "bot",
      ),
      "bot",
    ),
    "bot",
    "s1",
    "ws-work",
  );
}

test("the Navigator lists the registry, and a press opens the conversation", async () => {
  const app = await start(sampleRegistry());

  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");
  // The Bot's most recent Session stands in until L2: its chat is the Pane.
  await app.waitFor("id:chat");
  expect(app.shows("id:bot-pane")).toBe(true);
});

test("a draft Bot's Pane sends the person to its details", async () => {
  const created = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  const app = await start(createBot(created, { name: "Ada", templateId: "tmpl" }, "bot"));

  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:bot-pane-empty");
  expect(app.texts().some((text) => text.includes("No conversation"))).toBe(true);
  await app.press("label:Bot details…");
  await app.waitFor("id:bot-details");
  expect(app.texts()).toContain("Profile");
});

test("the Bot details button sits in the Pane header with split and close", async () => {
  const app = await start(sampleRegistry());
  await app.waitFor("label:Ada");
  await app.press("label:Ada");
  await app.waitFor("id:tab-panel-1 >> text:Ada");

  expect(app.shows("label:Bot details: Ada")).toBe(true);
  expect(app.shows("label:Split Ada right")).toBe(true);
  // The Inspector drawer and its command are gone.
  expect(app.shows("label:Show Inspector")).toBe(false);
  // Close shows once there is a second Pane to fall back to.
  await app.keyboard.press("mod+\\");
  await app.waitFor("id:tab-panel-2");
  expect(app.shows("label:Close Ada")).toBe(true);

  await app.press("label:Bot details: Ada");
  await app.waitFor("id:bot-details");
  expect(app.texts()).toContain("Runs with");
});

test("the New Bot row opens the dialog", async () => {
  const app = await start(sampleRegistry());
  await app.waitFor("label:Ada");

  await app.press("label:New Bot");
  await app.waitFor("id:new-bot-dialog");
  await app.waitFor("id:new-bot-name");
  expect(app.shows("label:Ada")).toBe(true);
});
