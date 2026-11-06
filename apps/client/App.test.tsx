import { expect, open, test } from "nsh/test";

/** Wide enough for the desktop shell on both desktop (700) and other (900) idioms. */
const desktop = { platform: "web" as const, width: 1100, height: 800 };

test("shows the side navigator", async () => {
  const app = await open("./App.tsx", desktop);
  const texts = app.texts();
  expect(texts.some((t) => t.includes("Collapse"))).toBe(true);
  expect(texts.some((t) => t.includes("Favorites"))).toBe(true);
});

test("collapses the navigator to a drag strip", async () => {
  const app = await open("./App.tsx", desktop);
  await app.press("label:Collapse navigator");
  const texts = app.texts();
  expect(texts.some((t) => t.includes("Expand"))).toBe(true);
  expect(texts.some((t) => t.includes("Collapse"))).toBe(false);
  expect(texts.some((t) => t.includes("Favorites"))).toBe(false);
});

test("narrow window keeps the placeholder", async () => {
  const app = await open("./App.tsx", { platform: "web" as const, width: 600, height: 800 });
  const texts = app.texts();
  expect(texts.some((t) => t.includes("Workspace Shell"))).toBe(true);
  expect(texts.some((t) => t.includes("Collapse"))).toBe(false);
});
