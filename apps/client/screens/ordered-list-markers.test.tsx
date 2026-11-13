/**
 * An ordered list whose markers run past one digit. The harness answers
 * "numbered" with a 22-item list, so the marker column can be measured
 * without a Host; only the picture needs a graphical target.
 *
 *   nsh test screens/ordered-list-markers.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical, shoot, SHOTS_CHAT } from "./shots";

/** `chat-harness.tsx`'s numbered reply: as many items (a test imports no app code). */
const COUNT = 22;

test("a 22-item list keeps every marker", async () => {
  const app = await open("../features/dialogue/chat/chat-harness.tsx", {
    platform: "web" as const,
    width: 1200,
    height: 900,
  });
  await app.waitFor("text:Message Ada");
  await app.type("id:composer", "numbered please");
  await app.press("label:Send");
  await app.waitUntil(() => app.texts().includes(`${COUNT}.`), { timeout: 20000 });

  // The markers are texts of their own: "1." … "22.", none of them cut.
  for (const number of [1, 9, 10, 11, 20, COUNT]) {
    expect(app.texts()).toContain(`${number}.`);
  }
  expect(app.texts()).toContain(`Item ${COUNT} of ${COUNT} in this numbered list.`);

  if (!(await graphical(app))) return;
  await app.wait(400);
  await shoot(app, "04-numbered-list.png", SHOTS_CHAT);
});
