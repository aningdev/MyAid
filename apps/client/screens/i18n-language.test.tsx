/**
 * The interface language (L4): `system` reads NSH's locale (a `zh*` tag is
 * 简体中文, anything else English) and follows a change; the General page's
 * choice applies at once without relaunching, and a launch reads it back.
 */
import { expect, test } from "nsh/test";

import { emptyShellPrefs, SHELL_PREFS_STORAGE } from "../components/shell/prefs";
import { messages } from "../lib/i18n";
import { open } from "../test/open";

const desktop = { platform: "macos" as const, width: 1100, height: 900, clock: {} };

const zh = {
  newBot: messages["nav.newBot"].zh,
  settings: messages["settings.title"].zh,
  general: messages["settings.nav.general"].zh,
};
const en = {
  newBot: messages["nav.newBot"].en,
  settings: messages["settings.title"].en,
  languageZh: messages["language.zh"].en,
  languageEn: messages["language.en"].en,
};

test("跟随系统 shows 简体中文 for a zh locale and English otherwise", async () => {
  const chinese = await open("../App.tsx", { ...desktop, locale: "zh-Hans-CN" });
  await chinese.waitFor(`label:${zh.newBot}`);
  expect(chinese.shows(`label:${en.newBot}`)).toBe(false);

  const english = await open("../App.tsx", { ...desktop, locale: "fr-FR" });
  await english.waitFor(`label:${en.newBot}`);
  expect(english.shows(`label:${zh.newBot}`)).toBe(false);

  // Following the system is the stored default, not a preference yet.
  expect(emptyShellPrefs().appearance.language).toBe("system");
});

test("switching on the General page applies at once, without a relaunch", async () => {
  const app = await open("../App.tsx", { ...desktop, locale: "en-US" });
  await app.waitFor(`label:${en.newBot}`);

  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-overlay");
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");

  // Choosing 简体中文 redraws where the text stands.
  await app.press(`text:${en.languageZh}`);
  await app.waitUntil(() => app.shows(`label:${zh.newBot}`));
  expect(app.shows(`label:${en.newBot}`)).toBe(false);
  expect(app.texts()).toContain(zh.settings);
  expect(app.texts()).toContain(zh.general);

  // And back to English, still in the same window.
  await app.press(`text:${en.languageEn}`);
  await app.waitUntil(() => app.shows(`label:${en.newBot}`));
  expect(app.shows(`label:${zh.newBot}`)).toBe(false);
});

test("the choice is saved and a launch reads it back over the system language", async () => {
  const app = await open("../App.tsx", { ...desktop, locale: "en-US" });
  await app.waitFor(`label:${en.newBot}`);
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-overlay");
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  await app.press(`text:${en.languageZh}`);
  await app.waitUntil(() => {
    const prefs = app.storage()[SHELL_PREFS_STORAGE] ?? "";
    return prefs.includes('"language": "zh"');
  });

  // A relaunch on those preferences, on an English system, stays in Chinese.
  const again = await open("../App.tsx", {
    ...desktop,
    locale: "en-US",
    storage: app.storage(),
  });
  await again.waitFor(`label:${zh.newBot}`);
  expect(again.shows(`label:${en.newBot}`)).toBe(false);
  expect(JSON.parse(again.storage()[SHELL_PREFS_STORAGE] ?? "{}").appearance.language).toBe("zh");
});
