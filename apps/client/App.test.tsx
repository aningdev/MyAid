import { expect, open, test } from "nsh/test";

/** Wide enough for the desktop shell on both desktop (700) and other (900) idioms. */
const desktop = { platform: "web" as const, width: 1100, height: 800 };

test("shows the side navigator", async () => {
  const app = await open("./App.tsx", desktop);
  expect(app.shows("label:Collapse navigator")).toBe(true);
  expect(app.texts().some((t) => t.includes("Favorites"))).toBe(true);
});

test("collapses the navigator to a drag strip", async () => {
  const app = await open("./App.tsx", desktop);
  await app.press("label:Collapse navigator");
  expect(app.shows("label:Expand navigator")).toBe(true);
  expect(app.shows("label:Collapse navigator")).toBe(false);
  expect(app.texts().some((t) => t.includes("Favorites"))).toBe(false);
});

test("narrow window keeps the placeholder", async () => {
  const app = await open("./App.tsx", { platform: "web" as const, width: 600, height: 800 });
  const texts = app.texts();
  expect(texts.some((t) => t.includes("Workspace Shell"))).toBe(true);
  expect(app.shows("label:Collapse navigator")).toBe(false);
});

test("navigator shows sections with default-expanded contents", async () => {
  const app = await open("./App.tsx", desktop);
  const texts = app.texts();
  for (const section of ["Favorites", "Mail", "Bots", "Dialogues", "Settings"]) {
    expect(texts.some((t) => t === section)).toBe(true);
  }
  // Bots is expanded by default and empty, so it offers the way in; Mail is collapsed.
  expect(texts.some((t) => t === "New Bot")).toBe(true);
  expect(texts.some((t) => t === "Personal")).toBe(false);
  // The Host's reachability is a fact of the shell, always shown.
  expect(texts.some((t) => t === "Host disconnected")).toBe(true);
});

test("a single press on a leaf opens its address in the active panel", async () => {
  const app = await open("./App.tsx", desktop);
  expect(app.shows("id:tab-panel-1 >> text:Empty")).toBe(true);

  await app.press("role:treeitem[Today]");
  await app.waitFor("id:tab-panel-1 >> text:Today");
  expect(app.shows("text:Content coming soon")).toBe(true);
  expect(app.shows("text:Favorites › active › today")).toBe(true);
});

test("an empty Bots section leads to the new-Bot draft", async () => {
  const app = await open("./App.tsx", desktop);
  expect(app.shows("id:bot-name")).toBe(false);

  await app.press("role:treeitem[New Bot]");
  await app.waitFor("id:tab-panel-1 >> text:New Bot");
  await app.waitFor("id:bot-name");
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

test("mod+2 reveals the second Navigator section", async () => {
  const app = await open("./App.tsx", desktop);
  expect(app.shows("role:treeitem[Personal]")).toBe(false);
  await app.keyboard.press("mod+2");
  await app.waitFor("role:treeitem[Personal]");
});
