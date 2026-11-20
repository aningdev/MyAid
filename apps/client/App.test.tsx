import { expect, test } from "nsh/test";

import { t } from "./lib/i18n";
import { open, openIfSupported } from "./test/open";

/** The Runner: a desktop that owns a Host, wide enough for the desktop shell. */
const desktop = { platform: "macos" as const, width: 1100, height: 800, clock: {} };

test("shows the flat Bot list and the Host footer", async () => {
  const app = await open("./App.tsx", desktop);
  expect(app.shows("label:Collapse navigator")).toBe(true);
  expect(app.shows("label:Search Bots")).toBe(true);
  expect(app.shows("label:New Bot")).toBe(true);
  expect(app.shows("label:Settings")).toBe(true);
  // The footer is the launcher's fact row; a test app never runs the launcher
  // (`test/host-control.test.tsx`), so it reads the neutral line.
  expect(app.shows("id:host-status >> text:Host disconnected")).toBe(true);
  // No domain sections any more: the list is the product's only navigator.
  for (const gone of ["Favorites", "Mail", "Dialogues", "Spaces"]) {
    expect(app.texts()).not.toContain(gone);
  }
});

test("collapses the navigator to a drag strip", async () => {
  const app = await open("./App.tsx", desktop);
  await app.press("label:Collapse navigator");
  expect(app.shows("label:Expand navigator")).toBe(true);
  expect(app.shows("label:Collapse navigator")).toBe(false);
  expect(app.shows("label:Search Bots")).toBe(false);
});

test("narrow window keeps the placeholder", async () => {
  const app = await open("./App.tsx", { platform: "macos" as const, width: 600, height: 800 });
  const texts = app.texts();
  expect(texts.some((t) => t.includes("Workspace Shell"))).toBe(true);
  expect(app.shows("label:Collapse navigator")).toBe(false);
});

test("the workbench shortcuts split, focus and close panels", async () => {
  const app = await open("./App.tsx", desktop);
  expect(app.count("id:tab-panel-1")).toBe(1);

  await app.keyboard.press("mod+\\");
  await app.waitFor("id:tab-panel-2");
  await app.keyboard.press("mod+shift+\\");
  await app.waitFor("id:tab-panel-3");
  expect(app.count("id:tab-panel-1")).toBe(1);

  // Moving between panels works from the keyboard.
  await app.keyboard.press("mod+[");
  await app.keyboard.press("mod+]");

  await app.keyboard.press("mod+w");
  await app.waitUntil(() => app.count("id:tab-panel-3") === 0);
  await app.keyboard.press("mod+w");
  await app.waitUntil(() => app.count("id:tab-panel-2") === 0);

  // The last panel stays, whatever the shortcut says.
  await app.keyboard.press("mod+w");
  expect(app.count("id:tab-panel-1")).toBe(1);
});

test("an empty workbench leads to the first Bot", async () => {
  const app = await open("./App.tsx", desktop);
  await app.waitFor("text:Welcome to dsh-bot");
  expect(app.shows("label:Create your first Bot")).toBe(true);
  await app.press("label:Create your first Bot");
  await app.waitFor("id:new-bot-dialog");
});

test("⌘, opens Settings, and Escape comes back", async () => {
  const app = await open("./App.tsx", desktop);
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-overlay");
  expect(app.shows("id:settings-providers")).toBe(true);
  for (const group of [
    "settings.nav.providers",
    "settings.nav.general",
    "settings.nav.background",
    "settings.nav.about",
  ] as const) {
    expect(app.texts()).toContain(t(group));
  }
  await app.keyboard.press("escape");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
  expect(app.shows("id:tab-panel-1")).toBe(true);
});

test("a Device without a pairing record asks for one", async () => {
  // A phone platform is refused on `--target macos`, so the gate is asserted on
  // the headless engine; `screens/pairing-shots.test.tsx` draws the pairing
  // screen on the macOS target.
  const app = await openIfSupported("./App.tsx", { platform: "ios", width: 390, height: 844 });
  if (!app) return;
  const texts = app.texts();
  expect(texts).toContain("Connect to your Runner");
  expect(texts.some((text) => text.includes("pairing link"))).toBe(true);
  expect(app.shows("label:Collapse navigator")).toBe(false);
  expect(texts).not.toContain("Host disconnected");
});
