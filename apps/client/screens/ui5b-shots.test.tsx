/**
 * Batch 5b of the shadcn-nsh copies: the `Alert` in the shell's notices, in
 * the Pane's connection banner and in the settings' background error, the
 * `Skeleton` of the three loading places, the `Item` of a queued prompt and an
 * answered approval, the `Empty` of a registry that could not be read, the
 * spinner copy in a running tool row and the group's fields with the keys.
 *
 *   mkdir -p ~/.myaid-dev/shots/pi-shots-ui5b
 *   nsh test screens/ui5b-shots.test.tsx --target macos
 *
 * A headless run stops at the picture probe.
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
  type BotRegistry,
} from "../features/bots/model";
import { REGISTRY_STORAGE_KEY } from "../features/bots/store";
import { t } from "../lib/i18n";
import { open } from "../test/open";
import { workspaceRow, workspaceStorage } from "../test/workspaces";
import { graphical, shoot, SHOTS_UI5B } from "./shots";

/** Ada and Cleo, each ready with one segment over one Workspace. */
function fixture(): BotRegistry {
  const template = createTemplate(
    emptyRegistry(),
    { name: "Coding", presetId: "standard" },
    "tmpl",
  );
  let registry = template;
  for (const [id, name] of [
    ["ada", "Ada"],
    ["cleo", "Cleo"],
  ] as const) {
    registry = initializeBot(createBot(registry, { name, templateId: "tmpl" }, id), id);
    registry = claimSegment(registry, id, `s-${id}`, `ws-${id}`);
  }
  return registry;
}

function shellStorage(): Record<string, string> {
  return {
    [REGISTRY_STORAGE_KEY]: serializeRegistry(fixture()),
    [SHELL_PREFS_STORAGE]: serializeShellPrefs(emptyShellPrefs()),
    ...workspaceStorage({
      rows: ["ada", "cleo"].map((id, index) =>
        workspaceRow({
          id: `ws-${id}`,
          path: `/work/${id}`,
          title: id,
          sessionIds: [`s-${id}`],
          updatedAt: `2026-02-0${2 - index}T00:00:00.000Z`,
        }),
      ),
    }),
  };
}

/** A v4 registry: read, never written, and its notice stands in the Navigator. */
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

/** A registry file the app cannot read: its own state, not a first launch. */
const CORRUPT = "{ this is not a registry";

/** The picture in both appearances. */
async function both(app: App, name: string): Promise<void> {
  await app.setColorScheme("light");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-light.png`, SHOTS_UI5B);
  await app.setColorScheme("dark");
  await app.wait(250);
  await shoot(app, `${name.replace(".png", "")}-dark.png`, SHOTS_UI5B);
  await app.setColorScheme("light");
}

test("the Navigator's search with the keys, after ⌘F", async () => {
  const app = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
    storage: shellStorage(),
  });
  if (!(await graphical(app))) return;
  await app.waitFor("label:Cleo");

  // ⌘F puts the keys in the group's control: the ring is the group's, and the
  // letters that follow land in the field.
  await app.keyboard.press("mod+f");
  await app.wait(200);
  await app.keyboard.press("c");
  await app.waitUntil(() => app.value("id:nav-search") === "c");
  await app.wait(200);
  await both(app, "11-search-focused.png");
  expect(app.texts()).toContain("Cleo");
  expect(app.texts()).not.toContain("Ada");
}, 120000);

test("a notice, and the registry that could not be read", async () => {
  const notice = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
    storage: { [REGISTRY_STORAGE_KEY]: V4 },
  });
  if (!(await graphical(notice))) return;
  await notice.waitFor("id:migration-notice");
  await notice.wait(300);
  await both(notice, "21-notice.png");
  expect(
    notice.texts().some((text) => text.includes(t("registry.migrationTooOld", { version: 4 }))),
  ).toBe(true);

  const broken = await open("../App.tsx", {
    platform: "macos" as const,
    width: 1440,
    height: 900,
    storage: { [REGISTRY_STORAGE_KEY]: CORRUPT },
  });
  if (!(await graphical(broken))) return;
  await broken.waitFor(`text:${t("empty.registryTitle")}`);
  await broken.wait(300);
  await both(broken, "22-registry-error.png");
  expect(broken.texts()).toContain(t("empty.registryTitle"));
}, 120000);

test("the Composer, a running tool row and a page of history on its way", async () => {
  const app = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:composer", { timeout: 30000 });

  // The Composer's group with a draft that grows it, and its controls under it.
  await app.type(
    "id:composer",
    "A draft the composer grows with: it wraps over several lines, so the group that draws the " +
      "field is as tall as the text inside it, and the row of controls stays under the text.",
  );
  await app.wait(250);
  await both(app, "31-composer.png");
  await app.clear("id:composer");

  // A tool call that never returns: its row spins, and so does the reply.
  await app.type("id:composer", "running the tests");
  await app.keyboard.press("Return");
  await app.waitFor("id:composer", { timeout: 30000 });
  await app.wait(400);
  await both(app, "32-running-tool.png");
  expect(app.texts()).toContain(t("chat.working"));

  // A page of older history on its way: the list's header is the shape of it.
  const reading = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(reading))) return;
  await reading.waitFor("id:composer", { timeout: 30000 });
  await reading.type("id:composer", "older messages please");
  await reading.keyboard.press("Return");
  await reading.waitFor("text:earlier answer 5", { timeout: 30000 });
  await reading.scroll("id:transcript", -3000);
  await reading.wait(400);
  await both(reading, "33-loading-history.png");
  expect(reading.shows("id:transcript")).toBe(true);
}, 180000);

test("an approval waiting, the answer under it, and a connection that dropped", async () => {
  const app = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "macos" as const,
    width: 1100,
    height: 820,
  });
  if (!(await graphical(app))) return;
  await app.waitFor("id:composer", { timeout: 30000 });

  await app.type("id:composer", "approve a command");
  await app.keyboard.press("Return");
  await app.waitFor(`label:${t("chat.allowOnce")}`, { timeout: 30000 });
  await app.wait(300);
  await both(app, "41-approval.png");

  // Answered, it folds into the muted item that records it.
  await app.press(`label:${t("chat.allowOnce")}`);
  await app.wait(300);
  await both(app, "42-approval-answered.png");

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
  await both(failed, "43-error-row.png");
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
  await both(lost, "44-connection-banner.png");
  expect(lost.shows("id:chat-banner")).toBe(true);
}, 180000);
