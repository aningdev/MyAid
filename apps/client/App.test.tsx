import { expect, open, test } from "nsh/test";

test("shows workspace chrome", async () => {
  const app = await open("./App.tsx");
  const texts = app.texts();
  expect(texts.some((t) => t.includes("MyAid") || t.includes("Today") || t.includes("Chat"))).toBe(
    true,
  );
});
