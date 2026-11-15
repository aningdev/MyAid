/**
 * Batch 6 of the shadcn-nsh copies: the `Alert` in the shell's notices, in the
 * Pane's connection banner and in the reply's error row back in the doc's
 * shape (the mark beside the note, the action inside it), and Settings ›
 * General's new Colour choice — the Navigator and a Pane under each theme.
 *
 *   mkdir -p ~/.myaid-dev/shots/pi-shots-ui6
 *   nsh test screens/ui6-shots.test.tsx --target macos
 *
 * The apps are opened in the app's isolated storage, never the real
 * `~/.myaid`; a headless run stops at the picture probe.
 */
import { expect, test } from "nsh/test";
import type { App } from "nsh/test";

import {
  emptyShellPrefs,
  serializeShellPrefs,
  SHELL_PREFS_STORAGE,
} from "../components/shell/prefs";
import {
  claimSegment,
  createBot,
  createTemplate,
  emptyRegistry,
  initializeBot,
  serializeRegistry,
} from "../features/bots/model";
import { REGISTRY_STORAGE_KEY } from "../features/bots/store";
import { t } from "../lib/i18n";
import { open } from "../test/open";
import { workspaceRow, workspaceStorage } from "../test/workspaces";
import { graphical, shoot, SHOTS_UI6 } from "./shots";

/** Ada, ready with one segment over one Workspace, in the one Pane. */
function shellStorage(): Record<string, string> {
  let registry = createTemplate(emptyRegistry(), { name: "Coding", presetId: "standard" }, "tmpl");
  registry = initializeBot(createBot(registry, { name: "Ada", templateId: "tmpl" }, "ada"), "ada");
  registry = claimSegment(registry, "ada", "s-ada", "ws-ada");
  const prefs = emptyShellPrefs();
  prefs.workbench = {
    layout: { center: { type: "tabs", panels: ["panel-1"], activeIndex: 0 } },
    contents: { "panel-1": { botId: "ada" } },
    activePanelId: "panel-1",
  };
  return {
    [REGISTRY_STORAGE_KEY]: serializeRegistry(registry),
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
      ],
    }),
  };
}

/** A v4 registry: read, never written, and its notice stands in the shell. */
const V4 = `${JSON.stringify({
  version: 4,
  templates: [{ id: "tmpl", name: "Coding", presetId: "standard" }],
  bots: [
    {
      id: "bot",
      name: "Ada",
      description: null,
      templateId: "tmpl",
      defaultModel: null,
      defaultThinking: null,
      defaultWorkspacePath: "/work/myaid",
      hadDialogue: true,
      status: "ready",
      boundPresetId: "standard",
      derivedPresetId: null,
      identity: { color: "rose", glyph: "orbit" },
    },
  ],
  dialogues: [
    {
      id: "dlg",
      botId: "bot",
      workspacePath: "/work/myaid",
      name: "Release notes",
      archived: false,
      claims: [{ sessionId: "s1", title: "First run", archived: false }],
    },
  ],
})}\n`;

/** The picture in both appearances. */
async function both(app: App, name: string): Promise<void> {
  await app.setColorScheme("light");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-light.png`, SHOTS_UI6);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-dark.png`, SHOTS_UI6);
  await app.setColorScheme("light");
}

test("a notice: the mark beside the sentence, the action under it", async () => {
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
    storage: { [REGISTRY_STORAGE_KEY]: V4 },
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:migration-notice");
  await app.wait(300);
  await both(app, "11-notice.png");
  expect(
    app.texts().some((text) => text.includes(t("registry.migrationTooOld", { version: 4 }))),
  ).toBe(true);
  expect(app.texts()).toContain(t("notices.connectHost"));
}, 120000);

test("the Pane's banner and the reply's error row", async () => {
  // A turn that failed: the reply's error row, with its message and Retry.
  const failed = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(failed))) return;
  await failed.waitFor("id:composer", { timeout: 30000 });
  await failed.type("id:composer", "error the turn");
  await failed.keyboard.press("Return");
  await failed.waitFor(`label:${t("chat.retry")}`, { timeout: 30000 });
  await failed.wait(400);
  await both(failed, "21-error-row.png");
  expect(failed.texts().some((text) => text.includes("the tool call failed"))).toBe(true);

  // The Session's connection drops: the Pane's banner over the transcript.
  const lost = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(lost))) return;
  await lost.waitFor("id:composer", { timeout: 30000 });
  await lost.type("id:composer", "fail the connection");
  await lost.keyboard.press("Return");
  await lost.waitFor("id:chat-banner", { timeout: 30000 });
  await lost.wait(400);
  await both(lost, "22-connection-banner.png");
  expect(lost.shows("id:chat-banner")).toBe(true);
}, 180000);

test("General's Colour choice, and the Navigator and Pane under each theme", async () => {
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1200,
    height: 820,
    storage: shellStorage(),
  });
  if (!(await graphical(app))) return;
  await app.waitFor(`label:${t("panel.botDetails", { name: "Ada" })}`);

  // Neutral: the theme the app is built with.
  await both(app, "31-neutral.png");

  await app.keyboard.press("mod+,");
  await app.waitFor("id:settings-overlay");
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  await app.wait(250);
  await both(app, "32-settings-general.png");
  expect(app.texts()).toContain(t("settings.general.themeCitrus"));

  // Citrus: the whole app, without a relaunch, then back to the Panes.
  await app.press(`text:${t("settings.general.themeCitrus")}`);
  await app.wait(350);
  await app.keyboard.press("Escape");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
  await app.wait(250);
  await both(app, "41-citrus.png");

  // And the choice survives the relaunch: the same surfaces, the same colours.
  const again = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1200,
    height: 820,
    storage: app.storage(),
  });
  if (!(await graphical(again))) return;
  await again.waitFor(`label:${t("panel.botDetails", { name: "Ada" })}`);
  await again.setColorScheme("light");
  await again.wait(250);
  await shoot(again, "42-citrus-relaunched-light.png", SHOTS_UI6);
}, 180000);
