/**
 * Inspector and Bot Settings over sources the test supplies
 * (`inspector-harness.tsx`): the sections a connected Host fills, the sheet's
 * tabs, and Compact's own outcome.
 */
import { expect, open, test } from "nsh/test";

const desktop = { platform: "web" as const, width: 1280, height: 820 };

async function app() {
  const opened = await open("./inspector-harness.tsx", desktop);
  await opened.waitFor("id:inspector-usage");
  return opened;
}

test("the Inspector shows the Session's usage and what it delivered", async () => {
  const screen = await app();

  // Bot: whose Session this is, and the preset it runs on.
  await screen.waitFor("id:inspector-bot >> text:Ada");
  expect(screen.texts()).toContain("Coding");
  expect(screen.texts()).toContain("standard");
  expect(screen.texts()).toContain("已绑定");
  // Dialogue: the workspace, its Session, and the next one.
  await screen.waitFor("id:inspector-dialogue");
  expect(screen.texts()).toContain("/Users/ada/release");
  expect(screen.shows("text:Release notes for 0.4")).toBe(true);
  expect(screen.shows("New Session")).toBe(true);
  // Usage: context with its window, the token totals, and Compact.
  expect(screen.texts()).toContain("28.1K / 1M");
  expect(screen.texts()).toContain("99.9K");
  expect(screen.texts()).toContain("17.9K");
  expect(screen.shows("Compact")).toBe(true);
  // Deliverables: the files the Session's turns presented.
  expect(screen.texts()).toContain("RELEASE-0.4.md");
  expect(screen.texts()).toContain("Release notes, 0.4");
});

test("Compact reports its outcome in place", async () => {
  const screen = await app();
  await screen.press("Compact");
  await screen.waitFor("text:历史已压缩。");
  expect(screen.shows("Compact")).toBe(true);
});

test("Bot Settings opens on the Inspector's Bot section and switches tabs", async () => {
  const screen = await app();
  await screen.press("Bot Settings…");
  await screen.waitFor("id:bot-settings");

  // Profile: the registry's preferences and how the preset is bound.
  expect(screen.value("id:bot-settings-name")).toBe("Ada");
  expect(screen.value("id:bot-settings-description")).toBe("Keeps the release branch tidy");
  expect(screen.texts()).toContain("已绑定");

  await screen.press("Runs with");
  await screen.waitFor("text:思考");
  expect(screen.texts()).toContain("DeepSeek Chat");
  expect(screen.shows("选择目录…")).toBe(true);

  await screen.press("Skills");
  await screen.waitFor("text:/release-notes");
  expect(screen.texts()).toContain("Write release notes from the changelog");

  await screen.press("Plugins");
  await screen.waitFor("text:@deepseek-ai/dsh-tool-bash");
  expect(screen.texts()).toContain("Bash");
  expect(screen.texts()).toContain("已停用");
});
