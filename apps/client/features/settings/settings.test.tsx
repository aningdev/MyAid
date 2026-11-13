/**
 * Settings › Background Services over the stand-in control channels
 * (`settings-harness.tsx`): the panel shows the Host's and Relay's own
 * registration facts, and its verbs issue the shared registration calls.
 */
import { expect, open, test } from "nsh/test";

const desktop = { platform: "macos" as const, width: 1100, height: 800 };

async function panel() {
  const app = await open("./settings-harness.tsx", desktop);
  // Settings is the eighth section; reveal it, then open its real leaf.
  await app.keyboard.press("mod+8");
  await app.waitFor("role:treeitem[Background Services]");
  await app.press("role:treeitem[Background Services]");
  await app.waitFor("id:settings-background");
  return app;
}

test("the panel shows the Host and Relay facts separately", async () => {
  const app = await panel();

  expect(app.shows("id:settings-host-phase >> text:Not registered")).toBe(true);
  expect(app.shows("id:settings-relay-phase >> text:Waiting for approval")).toBe(true);
  expect(app.texts()).toContain("Degraded");
});

test("Enable and Stop issue both units' registration verbs", async () => {
  const app = await panel();

  await app.press("label:Enable");
  await app.waitUntil(() => app.texts().filter((text) => text === "Registered").length === 2);
  expect(app.texts()).toContain("Full");

  await app.press("label:Stop");
  await app.waitUntil(() => app.texts().filter((text) => text === "Not registered").length === 2);
  expect(app.texts()).toContain("Off");
});
