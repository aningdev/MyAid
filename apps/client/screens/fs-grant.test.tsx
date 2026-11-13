/**
 * Capability check: `capabilities.fs` in nsh.json grants the app's data
 * (`~/.myaid`) and nothing else, so `file:` bytes a drop or a paste hands
 * over are read inside it, and outside it the app offers the open dialog
 * instead of reading. This probe reads no part of the real data root; it only
 * proves the refusal outside the grant. A headless run has no filesystem and
 * stops at the picture probe.
 *
 *   nsh test screens/fs-grant.test.tsx --target macos
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { graphical } from "./shots";

test("fs reads outside the app's data root are refused", async () => {
  const app = await open("./fs-probe.tsx", { platform: "macos" as const, width: 800, height: 600 });
  if (!(await graphical(app))) return;

  await app.waitUntil(() => (app.texts().join("\n") ?? "").includes("write-outside="), {
    timeout: 20000,
  });
  const lines = app.texts().join("\n");
  // Neither the home directory itself nor anything outside it is granted.
  expect(lines).toContain("read-home=ERR_ACCESS_DENIED");
  expect(lines).toContain("read-outside=ERR_ACCESS_DENIED");
  expect(lines).toContain("write-outside=ERR_ACCESS_DENIED");
}, 60000);
