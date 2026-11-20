/**
 * The whole interface in one language (L4): opening the app in English shows
 * no CJK text, and opening it in 简体中文 shows no English UI words beyond the
 * product terms and fixtures this file names. Walks the list, a Pane's
 * transcript and rail, Bot details, New Bot, ⌘K, a context menu, Settings and
 * the Host footer; the notification text is checked where it is built.
 */
import { expect, test } from "nsh/test";

import { notificationText } from "../components/shell/attention";
import {
  emptyShellPrefs,
  serializeShellPrefs,
  SHELL_PREFS_STORAGE,
} from "../components/shell/prefs";
import { emptyRegistry, type BotRegistry } from "../features/bots/model";
import { messages, setLanguagePref, type MessageKey, type MessageValues } from "../lib/i18n";
import {
  botsStorage,
  claimSegment,
  createBot,
  createTemplate,
  initializeBot,
} from "../test/bots-fixture";
import { open } from "../test/open";
import { workspaceRow, workspaceStorage } from "../test/workspaces";

type Lang = "zh" | "en";

const desktop = { platform: "macos" as const, width: 1100, height: 900 };

const CJK = /[\u3400-\u9fff]/;
/** Text that is Chinese in every language: a language picker's endonyms. */
const ENDONYMS = new Set(["简体中文"]);
const LATIN = /[A-Za-z][A-Za-z0-9_'’-]*/g;

/** A message in `lang`, independent of the language this test file shows. */
function say(lang: Lang, key: MessageKey, values: MessageValues = {}): string {
  return messages[key][lang].replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** Ada and Bob, each with one segment, in Registry order. */
function sample(): BotRegistry {
  const created = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  const ada = createBot(created, { name: "Ada", templateId: "tmpl" }, "ada");
  const bob = createBot(ada, { name: "Bob", templateId: "tmpl" }, "bob");
  const withAda = claimSegment(initializeBot(bob, "ada"), "ada", "s-ada", "ws-ada");
  return claimSegment(initializeBot(withAda, "bob"), "bob", "s-bob", "ws-bob");
}

function storage(): Record<string, string> {
  const prefs = emptyShellPrefs();
  prefs.workbench = {
    layout: { center: { type: "tabs", panels: ["panel-1"], activeIndex: 0 } },
    contents: { "panel-1": { botId: "ada" } },
    activePanelId: "panel-1",
  };
  return {
    ...botsStorage(sample()),
    [SHELL_PREFS_STORAGE]: serializeShellPrefs(prefs),
    ...workspaceStorage({
      rows: [
        workspaceRow({
          id: "ws-ada",
          path: "/work/ada",
          title: "ada",
          sessionIds: ["s-ada"],
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        workspaceRow({
          id: "ws-bob",
          path: "/work/bob",
          title: "bob",
          sessionIds: ["s-bob"],
          updatedAt: "2026-02-01T00:00:00.000Z",
        }),
      ],
    }),
  };
}

/** Every string the walk saw, from one app. */
function collect(into: string[], app: { texts(): string[] }): void {
  into.push(...app.texts());
}

async function walkShell(lang: Lang, texts: string[]): Promise<void> {
  const app = await open("../screens/i18n-harness.tsx", {
    ...desktop,
    locale: lang === "zh" ? "zh-CN" : "en-US",
    storage: storage(),
  });
  await app.waitFor(`label:${say(lang, "nav.newBot")}`);
  collect(texts, app);

  // The Host footer is the offline fact row.
  expect(app.shows(`id:host-status >> text:${say(lang, "host.disconnected")}`)).toBe(true);
  // The Pane's banner says why the connection is gone.
  expect(app.shows(`text:${say(lang, "host.control.notRunning")}`)).toBe(true);

  // A row's context menu.
  await app.rightClick("label:Ada");
  await app.waitFor(`text:${say(lang, "menu.rename")}`);
  collect(texts, app);
  await app.keyboard.press("escape");
  await app.waitUntil(() => !app.shows(`text:${say(lang, "menu.rename")}`));

  // New Bot.
  await app.press(`label:${say(lang, "nav.newBot")}`);
  await app.waitFor("id:new-bot-dialog");
  collect(texts, app);
  await app.press(`label:${say(lang, "common.cancel")}`);
  await app.waitUntil(() => !app.shows("id:new-bot-dialog"));

  // ⌘K.
  await app.keyboard.press("mod+k");
  await app.waitFor("id:command-palette");
  collect(texts, app);
  await app.keyboard.press("escape");
  await app.waitUntil(() => !app.shows("id:command-palette"));

  // Bot details, every tab.
  await app.press(`label:${say(lang, "panel.botDetails", { name: "Ada" })}`);
  await app.waitFor("id:bot-details");
  collect(texts, app);
  for (const tab of [
    "bot.tab.runs",
    "bot.tab.skills",
    "bot.tab.plugins",
    "bot.tab.profile",
  ] as const) {
    await app.press(`text:${say(lang, tab)}`);
    await app.wait(80);
    collect(texts, app);
  }
  await app.press(`label:${say(lang, "bot.closeDetails")}`);
  await app.waitUntil(() => !app.shows("id:bot-details"));

  // Settings, every group.
  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-overlay");
  collect(texts, app);
  for (const group of [
    "settings-nav-general",
    "settings-nav-background",
    "settings-nav-about",
    "settings-nav-providers",
  ]) {
    await app.press(`id:${group}`);
    await app.wait(120);
    collect(texts, app);
  }
  await app.keyboard.press("escape");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
}

/** The transcript, its segment divider and the history rail's hover card. */
async function walkTranscript(lang: Lang, texts: string[]): Promise<void> {
  const app = await open("../features/dialogue/long-conversation-harness.tsx", {
    ...desktop,
    locale: lang === "zh" ? "zh-CN" : "en-US",
  });
  await app.waitFor("id:history-rail");
  collect(texts, app);
  await app.press("id:history-mark-s1");
  await app.waitFor("text:the earlier answer");
  collect(texts, app);
  await app.hover("id:history-mark-s1");
  await app.waitFor("id:rail-card");
  await app.wait(150);
  collect(texts, app);
}

/** User content the harness carries: a Bot's name, a segment's title, its messages. */
const FIXTURE_TEXT =
  /^(Ada|Bob|Coding|Earlier topic|Today's topic|Ada · Today's topic|the (earlier|current) (question|answer)|follow-up (question|answer) \d+)$/;

/** Product terms and proper names that stay as they are, plus commands and key names. */
const NOT_TRANSLATED = new Set([
  // Product and proper names.
  "dsh-bot",
  "Host",
  "Relay",
  "dsh",
  "DeepSeek",
  "Background",
  "Services",
  "Navigator",
  "Workbench",
  "Workspace",
  "Workspaces",
  "Agent",
  "API",
  "Key",
  "URL",
  "SKILL",
  // Glossary terms the Chinese UI keeps in English (docs/GLOSSARY.md), and the
  // palette's uppercased group heading.
  "Bot",
  "Bots",
  "BOT",
  "Pane",
  "Panes",
  "Pin",
  "Profile",
  "Runs",
  "Skills",
  "Plugins",
  "Compact",
  "Session",
  "Sessions",
  "Dialogue",
  "Dialogue's",
  "Start",
  "preset",
  "standard",
  "web",
  // Platform keys the system names; a language picker shows English by endonym.
  "Return",
  "Esc",
  "esc",
  "Ctrl",
  "N",
  "K",
  "F",
  "B",
  "L",
  "W",
  "English",
  // dsh's own API names inside a translated frame, and a file extension.
  "list",
  "read",
  "select",
  "md",
  // Commands the Host's empty state names, which are not translated.
  "bun",
  "run",
  "dev",
  "cargo",
  "p",
  "dsh-bot-host",
  "serve-app",
]);

test("English shows no CJK, and 简体中文 no English UI words outside the terms", async () => {
  const english: string[] = [];
  await walkShell("en", english);
  await walkTranscript("en", english);
  for (const text of english) {
    if (ENDONYMS.has(text)) continue;
    expect({ text, cjk: CJK.test(text) }).toEqual({ text, cjk: false });
  }

  const chinese: string[] = [];
  await walkShell("zh", chinese);
  await walkTranscript("zh", chinese);
  const leftovers: string[] = [];
  for (const text of chinese) {
    if (FIXTURE_TEXT.test(text)) continue;
    // A Bot's name is user content: the header is "name · title".
    // Paths, URLs and flags are data, not words; so are hyphenated ids.
    const words =
      text
        .replace(/^(Ada|Bob) · /, "")
        .replace(/~?\/[\w./:@-]*/g, " ")
        .match(LATIN) ?? [];
    for (const word of words) {
      if (NOT_TRANSLATED.has(word) || /\d/.test(word) || word.includes("-")) continue;
      leftovers.push(`${word} in ${JSON.stringify(text)}`);
    }
  }
  expect([...new Set(leftovers)]).toEqual([]);
}, 180_000);

test("a notification's title and body follow the interface language", () => {
  try {
    setLanguagePref("zh");
    const zh = notificationText({ botName: "Ada" }, "approval");
    expect(zh.title).toBe("Ada");
    expect(zh.body).toBe(say("zh", "notification.approval"));
    const reply = notificationText({ botName: "Ada" }, "reply");
    expect(reply.body).toBe(say("zh", "notification.replied"));
  } finally {
    setLanguagePref("system");
  }
  const en = notificationText({ botName: "Ada" }, "approval");
  expect(en.body).toBe(say("en", "notification.approval"));
});
