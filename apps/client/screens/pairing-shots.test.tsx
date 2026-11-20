/**
 * The Pairing entry's pictures: the entry a Device sees before it has a
 * Runner, the copy for a refused link, and the notice after a revoke — at a
 * desktop width and at a phone's.
 *
 *   nsh test screens/pairing-shots.test.tsx --target macos
 *
 * A headless run stops at the picture probe.
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { PAIRING_SHOT_KEY } from "./pairing-harness";
import { graphical, shoot } from "./shots";

/** Pictures for this batch live with the handoff, beside its summary. */
const SHOTS = "../../.handoff/shots";

test("pairing entry, refused link and removed notice", async () => {
  const desktop = await open("./pairing-harness.tsx", {
    platform: "macos" as const,
    width: 900,
    height: 680,
    storage: { [PAIRING_SHOT_KEY]: "unpaired" },
  });
  if (!(await graphical(desktop))) return;

  await desktop.waitFor("text:Connect to your Runner");
  await shoot(desktop, "pairing-desktop.png", SHOTS);

  const phone = await open("./pairing-harness.tsx", {
    platform: "macos" as const,
    width: 390,
    height: 844,
    storage: { [PAIRING_SHOT_KEY]: "unpaired" },
  });
  await phone.waitFor("text:Connect to your Runner");
  await shoot(phone, "pairing-phone.png", SHOTS);

  const refused = await open("./pairing-harness.tsx", {
    platform: "macos" as const,
    width: 390,
    height: 844,
    storage: { [PAIRING_SHOT_KEY]: "error:pairing-rejected" },
  });
  await refused.waitFor("id:pairing-error");
  await shoot(refused, "pairing-error.png", SHOTS);

  const removed = await open("./pairing-harness.tsx", {
    platform: "macos" as const,
    width: 390,
    height: 844,
    storage: { [PAIRING_SHOT_KEY]: "removed" },
  });
  await removed.waitFor("id:pairing-removed");
  await shoot(removed, "pairing-removed.png", SHOTS);

  expect(phone.texts()).toContain("Connect to your Runner");
});
