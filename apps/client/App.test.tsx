import { expect, open, test } from "nsh/test";

test("shows workspace chrome", async () => {
  // Headless iOS draws the system tab bar without text nodes, so the rail
  // labels are checked on a desktop-width web viewport.
  const app = await open("./App.tsx", { platform: "web", width: 1100, height: 800 });
  const texts = app.texts();
  expect(texts.some((t) => t.includes("MyAid") || t.includes("Today") || t.includes("Chat"))).toBe(
    true,
  );
});
