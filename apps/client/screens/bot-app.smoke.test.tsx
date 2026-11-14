/**
 * Real-Host smoke: the Bot app's Panes. Two Bots open over two directories,
 * dragged into two Panes, stream at the same time; one is Pinned; Bot details
 * renames the other and the list and Pane title follow; a second launch on the
 * registry and prefs this one wrote restores the Panes, their Bots and the
 * Pin.
 *
 * Opt in with MYAID_SMOKE_HOST on a scratch home; the app starts the Host
 * itself, so nothing runs beforehand (see screens/README.md):
 *
 *   SC=$PWD/.myaid-smoke                         # gitignored, outside /tmp
 *   mkdir -p "$SC/home"
 *   HOME="$SC/home" MYAID_SMOKE_HOST=1 MYAID_HOST_PORT=4879 \
 *     PATH="$PWD/target/debug:$PATH" \
 *     nsh test screens/bot-app.smoke.test.tsx --target macos
 *
 * A headless run stops at the picture probe.
 */
import { homedir } from "os";

import { expect, test } from "nsh/test";

import { SHELL_PREFS_STORAGE } from "../components/shell/prefs";
import { t } from "../lib/i18n";
import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_L1 } from "./shots";

const WORKSPACE = "/tmp";
/** The second Bot's directory: another Workspace, so both Sessions may run. */
const OTHER = homedir();

const SLOW = (tag: string) =>
  `${tag} answer slowly. Write 24 numbered lines, one short sentence each, and nothing else.`;
/**
 * Long enough that the second send, whose prompt this harness types key by
 * key (tens of seconds), certainly lands while the first turn still runs.
 */
const LONG = (tag: string) =>
  `${tag} take your time. Write 240 numbered lines, one short sentence each, and nothing else.`;

type App = Awaited<ReturnType<typeof open>>;

/** Create a Bot on the scratch Host; its Pane opens with the first Session. */
async function botToChat(app: App, name: string, path: string) {
  await app.keyboard.press("mod+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", name);
  await app.type("id:new-bot-workspace", path);
  await app.waitFor("text:Reading dsh presets…", { state: "gone", timeout: 120000 });
  await app.press("label:Create Bot");
  await app.waitFor("id:chat", { timeout: 180000 });
  await app.waitFor("id:composer", { timeout: 60000 });
}

/** Type a prompt into one Pane's composer and send it. */
async function send(app: App, prompt: string, nth = 0) {
  await app.type(`id:composer >> nth=${nth}`, prompt);
  await app.keyboard.press("enter");
}

test("two Bots in two Panes, a Pin, a drag-in, a restart and a details edit", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  if (!(await graphical(app))) return;
  await app.waitFor("text:Host connected", { timeout: 60000 });

  // Alpha first, then Beta: a new Bot opens in the active Pane, so the drag
  // below is what gives Alpha its own Pane beside Beta.
  await botToChat(app, "L1 Alpha", WORKSPACE);
  await botToChat(app, "L1 Beta", OTHER);
  await app.drag("label:L1 Alpha", { x: 220 });
  await app.waitFor("id:tab-panel-2", { timeout: 60000 });
  await app.waitFor("id:chat >> nth=1", { timeout: 60000 });
  await shoot(app, "01-two-panes.png", SHOTS_L1);

  // Pin Alpha from its row's menu: the Pin group stands above the rest.
  await app.rightClick("label:L1 Alpha");
  await app.press("text:Pin");
  await app.waitFor("text:Pin");
  const pinned = app.texts();
  expect(pinned.indexOf("Pin")).toBeLessThan(pinned.indexOf("L1 Alpha"));

  // Both stream at once: the second send starts while the first still runs,
  // and the list shows both Bots' working dots beside the Pin group.
  await send(app, LONG("L1-A"), 1);
  await app.waitFor("label:Stop generating", { timeout: 240000 });
  await send(app, SLOW("L1-B"), 0);
  // Two Stop buttons, two working rows: the overlap itself.
  await app.waitFor("label:Stop generating >> nth=1", { timeout: 120000 });
  expect(app.count(`text:${t("chat.working")}`)).toBe(2);
  await shoot(app, "02-list-pin-working.png", SHOTS_L1);
  await app.waitFor(`text:${t("chat.working")}`, { state: "gone", timeout: 600000 });
  await app.waitFor("label:Stop generating", { state: "gone", timeout: 120000 });

  // Bot details: a rename saves in the registry, and the list and Pane follow.
  await app.press("label:Bot details: L1 Beta");
  await app.waitFor("id:bot-details", { timeout: 30000 });
  await shoot(app, "04-bot-details-modal.png", SHOTS_L1);
  await app.clear("id:bot-details-name");
  await app.type("id:bot-details-name", "L1 Beta Renamed");
  await app.press("id:bot-details >> Save");
  await app.waitUntil(() => !app.shows("id:bot-details"), { timeout: 30000 });
  await app.waitFor("label:L1 Beta Renamed", { timeout: 30000 });
  await shoot(app, "03-details-saved.png", SHOTS_L1);

  // A second launch on what this one wrote: the Panes, their Bots and the Pin.
  await app.waitUntil(
    () => {
      const prefs = app.storage()[SHELL_PREFS_STORAGE] ?? "";
      return prefs.includes('"pins"') && prefs.includes('"panel-2"');
    },
    { timeout: 15000 },
  );
  const storage = app.storage();
  const relaunched = await open("../App.tsx", {
    width: 1440,
    height: 900,
    network: "live",
    storage,
  });
  if (!(await graphical(relaunched))) return;
  await relaunched.waitFor("text:Host connected", { timeout: 60000 });
  await relaunched.waitUntil(() => relaunched.count("id:chat") === 2, { timeout: 120000 });
  // Each Pane's transcript comes back from dsh: nothing was lost with the Panes.
  await relaunched.waitUntil(
    () => relaunched.texts().some((text) => text.includes("L1-A take your time")),
    { timeout: 120000 },
  );
  const restored = relaunched.texts();
  expect(restored).toContain("L1 Alpha");
  expect(restored).toContain("L1 Beta Renamed");
  expect(restored.indexOf("Pin")).toBeLessThan(restored.indexOf("L1 Alpha"));
  await shoot(relaunched, "05-restored.png", SHOTS_L1);
}, 1_200_000);
