import { expect, open, test } from "nsh/test";

test("creates a bot instance and binds its template preset", async () => {
  const app = await open("../../App.tsx", { platform: "web", width: 1100, height: 800 });
  await app.press("Bots");
  await app.waitFor("新建模板");

  await app.press("新建模板");
  await app.type("id:template-name", "Coding");
  await app.type("id:template-preset", "standard");
  await app.press("保存");
  expect(app.texts()).toContain("Coding");
  expect(app.texts()).toContain("standard");

  await app.press("新建 Bot");
  await app.type("id:bot-name", "Ada");
  await app.type("id:bot-workspace", "/work");
  expect(app.texts()).toContain("跟随模板");
  expect(app.texts()).toContain("standard");

  await app.press("保存");
  expect(app.texts()).toContain("跟随模板");
  expect(app.value("id:bot-workspace")).toBe("/work");

  await app.press("初始化");
  await app.waitFor("已绑定");
  expect(app.texts()).toContain("standard");
  expect(app.texts()).toContain("/work");
  expect(app.texts()).not.toContain("跟随模板");
  expect(app.value("id:bot-workspace")).toBe(null);
  expect(app.shows("初始化")).toBe(false);
});

test("mobile stack returns to the bot list", async () => {
  const app = await open("../../App.tsx", { platform: "web", width: 390, height: 800 });
  await app.press("Bots");
  await app.waitFor("新建模板");
  await app.press("新建模板");
  await app.type("id:template-name", "Coding");
  await app.type("id:template-preset", "standard");
  await app.press("保存");
  await app.back();
  await app.waitFor("新建 Bot");
  await app.press("新建 Bot");
  await app.type("id:bot-name", "Ada");
  await app.type("id:bot-workspace", "/work");
  await app.press("初始化");
  await app.waitFor("已绑定");
  expect(app.texts()).not.toContain("跟随模板");
  expect(app.value("id:bot-workspace")).toBe(null);
  expect(app.texts()).toContain("standard");
});
