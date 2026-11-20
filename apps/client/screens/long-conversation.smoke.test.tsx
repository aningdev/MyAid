/**
 * Real-Host smoke: one Bot's long conversation. A first segment in one
 * directory, a new segment after changing the working directory, `/new`, the
 * history rail's keyboard jump back to the first segment, and a second launch
 * that restores the conversation.
 *
 * Opt in with DSH_BOT_SMOKE_HOST on a scratch home; the app starts the Host
 * itself (see screens/README.md):
 *
 *   SC=$PWD/.dsh-bot-smoke
 *   mkdir -p "$SC/home/.dsh-bot" "$SC/home/proj-a" "$SC/home/proj-b"
 *   HOME="$SC/home" DSH_BOT_SMOKE_HOST=1 DSH_BOT_HOST_PORT=4881 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/long-conversation.smoke.test.tsx --target macos
 */
import { homedir } from "os";

import { expect, test } from "nsh/test";

import { t } from "../lib/i18n";
import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_L2 } from "./shots";

// The smoke's HOME (`$SC/home`), so the UI reads the paths as `~/proj-*`.
const A = `${homedir()}/proj-a`;
const B = `${homedir()}/proj-b`;
/** What the Pane shows for them: the same paths under home. */
const A_LABEL = "~/proj-a";
const B_LABEL = "~/proj-b";

type App = Awaited<ReturnType<typeof open>>;

async function botToChat(app: App, name: string, path: string) {
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-dialog");
  await app.type("id:new-bot-name", name);
  await app.type("id:new-bot-workspace", path);
  await app.waitFor(`text:${t("newBot.readingPresets")}`, { state: "gone", timeout: 120000 });
  await app.press(`label:${t("newBot.create")}`);
  await app.waitFor("id:chat", { timeout: 180000 });
  await app.waitFor("id:composer", { timeout: 60000 });
}

async function send(app: App, prompt: string) {
  await app.type("id:composer", prompt);
  await app.press(`label:${t("chat.send")}`);
  await app.waitFor(`text:${prompt}`, { timeout: 60000 });
  await app.waitFor(`label:${t("chat.stopGenerating")}`, { state: "gone", timeout: 600000 });
}

test("two segments in two directories, /new, the rail and a restart", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;
  await app.waitFor(`text:${t("host.connected")}`, { timeout: 60000 });

  await botToChat(app, "L2 Ada", A);
  await send(app, "L2-A: first segment message");
  expect(app.texts().some((text) => text.includes(A_LABEL))).toBe(true);

  // Change the working directory in the header: a new segment in B.
  await app.press("id:session-workspace");
  await app.waitFor("id:session-workspace-input");
  await app.clear("id:session-workspace-input");
  await app.type("id:session-workspace-input", B);
  await app.press(`label:${t("chat.useWorkspace")}`);
  await app.waitFor("id:history-mark-1", { timeout: 120000 });
  await app.waitFor(`text:· ${B_LABEL}`, { timeout: 120000 });
  await shoot(app, "04-directory-change.png", SHOTS_L2);
  await send(app, "L2-B: second segment message");

  // `/new` opens a third segment in the same directory.
  await app.type("id:composer", "/new");
  await app.press(`label:${t("chat.send")}`);
  await app.waitFor("id:history-mark-2", { timeout: 120000 });
  await send(app, "L2-B: new topic message");

  // The rail jumps back to the first segment; the card closes with the jump.
  await app.press("id:history-mark-0");
  await app.waitFor("text:L2-A: first segment message", { timeout: 120000 });
  await app.waitFor(`text:· ${A_LABEL}`, { timeout: 120000 });
  await app.waitFor(`text:· ${B_LABEL}`, { timeout: 120000 });
  // Move the pointer off the rail so the divider picture is not under a card.
  await app.hover("id:chat");
  await app.wait(300);
  await shoot(app, "01-transcript-divider.png", SHOTS_L2);
  await app.hover("id:history-mark-0");
  await app.waitFor("id:rail-card", { timeout: 30000 });
  await app.wait(250);
  await shoot(app, "02-history-rail-hover.png", SHOTS_L2);

  // The same card close up, where its middle-truncated path is readable.
  await app.setViewport(980, 640);
  await app.wait(250);
  await app.hover("id:history-mark-0");
  await app.waitFor("id:rail-card", { timeout: 30000 });
  await app.wait(250);
  await shoot(app, "05-history-rail-card.png", SHOTS_L2);
  await app.setViewport(1440, 900);
  await app.wait(250);

  await app.press("id:history-mark-2");
  await app.waitFor("text:L2-B: new topic message", { timeout: 120000 });
  await shoot(app, "03-history-rail-jump.png", SHOTS_L2);

  // A prompt typed while scrolled up still goes to the latest segment; it
  // creates no new segment.
  expect(app.shows("id:history-mark-3")).toBe(false);
  await app.type("id:composer", "L2-B: sent from the older segment");
  await app.press(`label:${t("chat.send")}`);
  await app.waitFor("text:L2-B: sent from the older segment", { timeout: 60000 });
  await app.waitFor(`label:${t("chat.stopGenerating")}`, { state: "gone", timeout: 600000 });

  // The registry now has three segments; a second launch restores them.
  const storage = app.storage();
  const relaunched = await open("../App.tsx", {
    width: 1440,
    height: 900,
    network: "live",
    storage,
  });
  if (!(await graphical(relaunched))) return;
  await relaunched.waitFor(`text:${t("host.connected")}`, { timeout: 60000 });
  await relaunched.waitUntil(() => relaunched.count("id:chat") === 1, { timeout: 120000 });
  await relaunched.waitFor("id:history-mark-2", { timeout: 120000 });
  await relaunched.waitFor("text:L2-B: new topic message", { timeout: 120000 });
}, 1_800_000);
