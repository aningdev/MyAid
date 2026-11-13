/**
 * The long conversation's pictures over the scripted harness: the divider
 * between two segments, the history rail with its hover card, a rail jump, and
 * a new segment after changing the working directory.
 *
 *   nsh test screens/l2-shots.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical, shoot, SHOTS_L2 } from "./shots";

const desktop = { platform: "web" as const, width: 1200, height: 900 };

test("the divider, the history rail and a directory change", async () => {
  const app = await open("../features/dialogue/long-conversation-harness.tsx", desktop);
  if (!(await graphical(app))) return;
  await app.waitFor("text:follow-up answer 19");

  // The rail jumps to the older segment: the divider and both directories.
  await app.press("id:history-mark-s1");
  await app.waitFor("text:the earlier answer");
  await shoot(app, "harness-01-transcript-divider.png", SHOTS_L2);
  expect(app.texts().some((text) => text.includes("/proj-a"))).toBe(true);

  await app.hover("id:history-mark-s1");
  await app.waitFor("id:rail-card");
  await app.wait(250);
  await shoot(app, "harness-02-history-rail-hover.png", SHOTS_L2);

  await app.press("id:history-mark-s2");
  await app.waitFor("text:follow-up answer 19");
  await shoot(app, "harness-03-history-rail-jump.png", SHOTS_L2);

  await app.press("id:session-workspace");
  await app.waitFor("id:session-workspace-input");
  await app.clear("id:session-workspace-input");
  await app.type("id:session-workspace-input", "/proj-c");
  await app.press("label:Use this working directory");
  await app.waitUntil(() => app.texts().some((text) => text.includes("/proj-c")));
  await shoot(app, "harness-04-directory-change.png", SHOTS_L2);

  // A close-up of the hover card's surface and its middle-truncated path.
  await app.setViewport(760, 560);
  await app.hover("id:history-mark-s1");
  await app.waitFor("id:rail-card");
  await app.wait(250);
  await shoot(app, "harness-05-history-card.png", SHOTS_L2);
});
