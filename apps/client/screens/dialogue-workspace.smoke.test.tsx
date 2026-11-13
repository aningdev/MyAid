/**
 * Real-Host smoke for D1: a Dialogue is one Bot's view of a dsh Workspace.
 *
 * Two Bots open the same directory → one Workspace, two Dialogues; each lists
 * only its own Sessions. Renaming a Dialogue retitles the shared Workspace;
 * the pin set is dsh's; archiving an idle Session hides it; archiving a
 * running one is refused with `workspace/session-active` and offered as
 * "Stop and archive". A second app, opened with the first one's registry,
 * reads the title, pin and archive back from dsh.
 *
 * Opt in with MYAID_SMOKE_HOST_SOCKET; run against a scratch data root, never
 * the user's `~/.myaid` (see screens/README.md):
 *
 *   MYAID_SMOKE_HOST_SOCKET=/tmp/myaid-smoke-host.sock \
 *     MYAID_HOST_SOCKET=/tmp/myaid-smoke-host.sock HOME=<scratch>/home \
 *     nsh test screens/dialogue-workspace.smoke.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { REGISTRY_STORAGE_KEY } from "../features/bots/store";
import { open } from "../test/open";
import { graphical, hostSmokeRequested, shoot, SHOTS_D1 } from "./shots";

const WORKSPACE = "/tmp";
const PROMPT =
  "WORKSPACE-SMOKE: write 30 numbered lines about release notes, one short sentence each.";

test("a Dialogue is a Bot's view of a dsh Workspace", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", {
    width: 1440,
    height: 900,
    network: "live",
  });
  if (!(await graphical(app))) return;
  await app.waitFor("text:Host connected", { timeout: 30000 });

  // --- Bot Alpha: one Dialogue over /tmp, one Session. ---------------------
  await app.keyboard.press("mod+shift+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Alpha");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press("label:Create Bot");
  await app.waitFor("id:chat", { timeout: 120000 });
  await app.waitFor("id:composer", { timeout: 30000 });
  // Open Alpha's tree and name its Session, so the row is unique later.
  await app.press("role:treeitem[Alpha]");
  await app.waitFor("role:treeitem[tmp]", { timeout: 30000 });
  await app.press("role:treeitem[tmp] >> nth=0");
  await app.waitFor("role:treeitem[未命名上下文]", { timeout: 30000 });
  await app.rightClick("role:treeitem[未命名上下文] >> nth=0");
  await app.press("text:Rename…");
  await app.waitFor("id:rename-sheet");
  await app.clear("id:rename-name");
  await app.type("id:rename-name", "alpha-one");
  await app.press("label:Save");
  await app.waitFor("role:treeitem[alpha-one]", { timeout: 30000 });

  // --- Bot Beta: the same directory, its own Dialogue. ---------------------
  await app.keyboard.press("mod+shift+n");
  await app.waitFor("id:new-bot-sheet");
  await app.type("id:new-bot-name", "Beta");
  await app.type("id:new-bot-workspace", WORKSPACE);
  await app.press("label:Create Bot");
  await app.waitFor("id:chat", { timeout: 120000 });
  await app.waitFor("id:composer", { timeout: 30000 });
  await app.press("role:treeitem[Beta]");
  await app.waitFor("role:treeitem[tmp]", { timeout: 30000 });
  await app.press("role:treeitem[tmp] >> nth=1");
  await app.waitFor("role:treeitem[未命名上下文]", { timeout: 30000 });
  await app.rightClick("role:treeitem[未命名上下文] >> nth=0");
  await app.press("text:Rename…");
  await app.waitFor("id:rename-sheet");
  await app.clear("id:rename-name");
  await app.type("id:rename-name", "beta-one");
  await app.press("label:Save");
  await app.waitFor("role:treeitem[beta-one]", { timeout: 30000 });

  // One Workspace title ("tmp"), one Dialogue per Bot, one Session each.
  await app.waitUntil(() => app.count("role:treeitem[tmp]") === 2, { timeout: 30000 });
  expect(app.count("role:treeitem[alpha-one]")).toBe(1);
  expect(app.count("role:treeitem[beta-one]")).toBe(1);
  await shoot(app, "01-one-workspace-two-dialogues.png", SHOTS_D1);

  // --- Rename Alpha's Dialogue: the Workspace title is shared. ------------
  await app.rightClick("role:treeitem[tmp] >> nth=0");
  await app.press("text:Rename…");
  await app.waitFor("id:rename-sheet");
  await app.clear("id:rename-name");
  await app.type("id:rename-name", "shared-room");
  await app.press("label:Save");
  await app.waitUntil(() => app.count("role:treeitem[shared-room]") === 2, { timeout: 30000 });
  await shoot(app, "02-renamed-shared-title.png", SHOTS_D1);

  // --- Pin Alpha's Session: Favorites reads dsh's pin set. ----------------
  await app.rightClick("role:treeitem[alpha-one] >> nth=0");
  await app.press("text:Add to Favorites");
  await app.waitUntil(() => app.count("role:treeitem[alpha-one]") === 2, { timeout: 30000 });
  const favoritesAt = app.texts().indexOf("Favorites");
  const pinnedAt = app.texts().findIndex((text) => text === "alpha-one");
  expect(pinnedAt).toBeGreaterThan(favoritesAt);
  await shoot(app, "03-pinned-favorites.png", SHOTS_D1);

  // --- Archive an idle Session: it leaves the lists, dsh keeps it. --------
  await app.press("role:treeitem[shared-room] >> nth=0");
  await app.waitFor("text:New Session", { timeout: 30000 });
  // A press toggles the row. Alpha's Session row must be in the tree (Bots)
  // and in Favorites, so two rows mean its Dialogue is open.
  if (app.count("role:treeitem[alpha-one]") < 2) {
    await app.press("role:treeitem[shared-room] >> nth=0");
  }
  await app.press("text:New Session");
  await app.waitFor("id:chat", { timeout: 60000 });
  await app.rightClick("role:treeitem[未命名上下文] >> nth=0");
  await app.press("text:Rename…");
  await app.waitFor("id:rename-sheet");
  await app.clear("id:rename-name");
  await app.type("id:rename-name", "alpha-two");
  await app.press("label:Save");
  await app.waitFor("role:treeitem[alpha-two]", { timeout: 30000 });
  await app.rightClick("role:treeitem[alpha-two] >> nth=0");
  await app.press("text:Archive Session");
  await app.waitFor("role:treeitem[alpha-two]", { state: "gone", timeout: 30000 });
  await shoot(app, "04-idle-archived.png", SHOTS_D1);

  // --- Archive a running Session: dsh refuses, then stops and archives. ---
  await app.press("role:treeitem[beta-one] >> nth=0");
  await app.waitFor("id:composer", { timeout: 30000 });
  await app.type("id:composer", PROMPT);
  await app.keyboard.press("enter");
  await app.waitFor("text:Working…", { timeout: 60000 });
  await app.rightClick("role:treeitem[beta-one] >> nth=0");
  await app.press("text:Archive Session");
  await app.waitFor("id:archive-active-notice", { timeout: 30000 });
  expect(app.texts().some((text) => text.includes("还在执行"))).toBe(true);
  await shoot(app, "05-active-refused.png", SHOTS_D1);
  await app.press("label:Stop and archive");
  await app.waitFor("role:treeitem[beta-one]", { state: "gone", timeout: 60000 });
  await app.waitFor("id:archive-active-notice", { state: "gone", timeout: 30000 });
  await shoot(app, "06-stopped-and-archived.png", SHOTS_D1);

  // --- Restart: title, pin and archive come back from dsh. ----------------
  const registryText = app.storage()[REGISTRY_STORAGE_KEY] ?? "";
  expect(registryText).toContain('"workspaceId"');
  const restarted = await open("../App.tsx", {
    width: 1440,
    height: 900,
    network: "live",
    storage: { [REGISTRY_STORAGE_KEY]: registryText },
  });
  await restarted.waitFor("text:Host connected", { timeout: 30000 });
  // Both Dialogues read the shared title dsh holds, in the Dialogues section.
  await restarted.waitFor("role:treeitem[Alpha · shared-room]", { timeout: 60000 });
  expect(restarted.count("role:treeitem[Beta · shared-room]")).toBe(1);
  // dsh still pins alpha-one (Favorites reads its pin set); the archived two
  // never come back into the lists.
  await restarted.waitFor("role:treeitem[alpha-one]", { timeout: 30000 });
  expect(restarted.shows("role:treeitem[alpha-two]")).toBe(false);
  expect(restarted.shows("role:treeitem[beta-one]")).toBe(false);
  expect(restarted.shows("id:archive-active-notice")).toBe(false);
  await shoot(restarted, "07-restarted-from-dsh.png", SHOTS_D1);
}, 900000);
