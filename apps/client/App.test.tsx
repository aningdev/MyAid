import { expect, open, test } from "nsh/test";

/** Headless starts phone-sized, where the system tab bar has no text nodes. */
const desktop = { platform: "macos" as const, width: 1200, height: 800 };

test("shows workspace chrome", async () => {
  const app = await open("./App.tsx", desktop);
  const texts = app.texts();
  expect(texts.some((t) => t.includes("Today") || t.includes("Chat"))).toBe(true);
});

test("opens Dialogue from primary navigation", async () => {
  const app = await open("./App.tsx", desktop);
  await app.press("label:Dialogue");
  expect(app.texts().some((t) => t.includes("New chat"))).toBe(true);
  await app.press("label:New chat");
  expect(app.texts().some((t) => t.includes("How can I help?"))).toBe(true);
});
