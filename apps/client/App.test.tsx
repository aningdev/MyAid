import { expect, open, test } from "nsh/test";

/** Headless iOS draws the system tab bar without text nodes. */
const desktop = { platform: "web" as const, width: 1100, height: 800 };

test("shows workspace chrome", async () => {
  // Headless iOS draws the system tab bar without text nodes, so the rail
  // labels are checked on a desktop-width web viewport.
  const app = await open("./App.tsx", desktop);
  const texts = app.texts();
  expect(texts.some((t) => t.includes("Today") || t.includes("Chat"))).toBe(true);
});

test("opens Dialogue from primary navigation", async () => {
  const app = await open("./App.tsx", desktop);
  await app.press("label:Dialogue");
  expect(
    app.texts().some((t) => t.includes("还没有认领的会话") || t.includes("全部会话")),
  ).toBe(true);
});
