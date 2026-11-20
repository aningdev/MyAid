/**
 * Settings › Devices over a fake Host control plane: pairing, the Relay
 * reason, revoke, and a `/watch` list. Nothing here listens on a port.
 *
 * Pictures (desktop and a phone width), when the target can draw:
 *   nsh test features/devices/devices.test.tsx --target macos
 */
import { expect, test, type App, type Dialog } from "nsh/test";

import { t } from "../../lib/i18n";
import { graphical } from "../../test/graphical";
import { open, openIfSupported } from "../../test/open";
import { PAIRING_LINK } from "./fixture";

/** Relative to `apps/client`, where `nsh test` is run. The driver writes these. */
const SHOTS = "../../.handoff/shots";

const desktop = { platform: "macos" as const, width: 1100, height: 800, clock: {} };
const phone = { platform: "macos" as const, width: 390, height: 844, clock: {} };

type Params = {
  unconfigured?: boolean;
  expired?: boolean;
  watch?: boolean;
  page?: boolean;
};

async function openDevices(params: Params = {}, size: typeof desktop = desktop): Promise<App> {
  const app = await open("./devices-harness.tsx", {
    ...size,
    host: { params },
  });
  if (!params.page) {
    await app.press(`label:${t("host.settings")}`);
    await app.waitFor("id:settings-overlay");
  }
  await app.press("id:settings-nav-devices");
  await app.waitFor("id:settings-devices");
  return app;
}

function showsCountdown(app: App): boolean {
  return ["5:02", "5:01", "5:00", "4:59", "4:58", "4:57"].some((time) =>
    app.shows(`text:${t("devices.expiresIn", { time })}`),
  );
}

async function shoot(app: App, name: string): Promise<void> {
  await app.screenshot(`${SHOTS}/${name}`);
}

test("a pairing link shows a code and a countdown", async () => {
  const app = await openDevices();
  await app.waitFor("id:devices-row-phone-1");
  expect(app.shows(`text:${t("devices.online")}`)).toBe(true);
  expect(app.shows(`text:${t("devices.platform", { platform: "ios" })}`)).toBe(true);

  await app.press("id:devices-add");
  await app.waitFor("id:devices-qr");
  await app.waitFor("id:devices-link");
  await app.waitUntil(() => showsCountdown(app));
  expect(app.shows(`text:${t("devices.expiresIn", { time: "0:00" })}`)).toBe(false);
  expect(app.shows(`text:${t("devices.replaces")}`)).toBe(true);

  await app.press("id:devices-copy");
  await app.waitUntil(() => app.clipboard() === PAIRING_LINK);
  expect(JSON.stringify(app.storage())).not.toContain("cHNr");
});

test("an unconfigured Relay shows the reason and no code", async () => {
  const app = await openDevices({ unconfigured: true });
  await app.waitFor("id:devices-relay-reason");
  expect(app.shows(`text:${t("devices.relay.badAddress")}`)).toBe(true);
  expect(app.shows("id:devices-qr")).toBe(false);
  expect(app.shows("id:devices-add")).toBe(false);
});

test("an expired pairing link asks to generate another", async () => {
  const app = await openDevices({ expired: true });
  await app.press("id:devices-add");
  await app.waitFor("id:devices-expired");
  expect(app.shows("id:devices-qr")).toBe(false);
  expect(app.shows("id:devices-link")).toBe(false);
  expect(app.shows(`text:${t("devices.regenerate")}`)).toBe(true);
});

test("revoke asks first, and cancel leaves the Device", async () => {
  const app = await openDevices();
  await app.waitFor("id:devices-row-phone-1");
  let asked: Dialog | null = null;
  app.onDialog((dialog) => {
    asked = dialog;
    return t("common.cancel");
  });
  await app.press("id:devices-revoke-phone-1");
  await app.waitUntil(() => asked !== null);
  const dialog = asked as Dialog | null;
  expect(dialog?.title).toBe(t("devices.revokeTitle", { name: "Pocket" }));
  expect(dialog?.buttons).toContain(t("devices.revoke"));
  expect(dialog?.buttons).toContain(t("common.cancel"));
  expect(app.shows("id:devices-row-phone-1")).toBe(true);
});

test("revoke deletes the Device after confirmation", async () => {
  const app = await openDevices();
  await app.waitFor("id:devices-row-phone-1");
  app.onDialog(() => t("devices.revoke"));
  await app.press("id:devices-revoke-phone-1");
  await app.waitUntil(() => !app.shows("id:devices-row-phone-1"));
  await app.waitFor("id:devices-empty");
});

test("a bridge.devices frame adds a Device and the page stays up", async () => {
  const app = await openDevices({ watch: true });
  await app.waitFor("id:devices-row-phone-1");
  await app.waitFor("id:devices-row-tablet-1");
  expect(app.shows("text:Slate")).toBe(true);
  expect(app.shows(`text:${t("devices.offline")}`)).toBe(true);
  expect(app.shows(`text:${t("devices.lastSeen", { time: t("devices.neverSeen") })}`)).toBe(true);
  expect(app.shows("id:devices-down")).toBe(false);
});

test("a Device swaps Devices for This Device", async () => {
  // A phone platform is refused on `--target macos`; the headless engine is
  // where this Device-only group is asserted.
  const app = await openIfSupported("./devices-harness.tsx", {
    platform: "ios",
    width: 390,
    height: 844,
    host: { params: { page: true } },
  });
  if (!app) return;
  await app.waitFor("id:settings-nav-providers");
  expect(app.shows("label:platform-ios")).toBe(true);
  expect(app.shows("id:settings-nav-about")).toBe(true);
  expect(app.shows("id:settings-nav-device")).toBe(true);
  expect(app.shows("id:settings-nav-devices")).toBe(false);
});

test("the devices page is usable at a phone width", async () => {
  const app = await openDevices({ page: true }, phone);
  await app.waitFor("id:devices-row-phone-1");
  expect(app.shows("id:devices-add")).toBe(true);
  expect(app.shows("id:settings-nav-general")).toBe(true);
  await app.press("id:devices-add");
  await app.waitFor("id:devices-qr");
  await app.waitUntil(() => showsCountdown(app));
});

test("devices screenshots, desktop and phone width", async () => {
  const list = await openDevices();
  if (!(await graphical(list))) return;
  await list.waitFor("id:devices-row-phone-1");
  await shoot(list, "desktop-devices-list.png");

  const code = await openDevices();
  await code.press("id:devices-add");
  await code.waitFor("id:devices-qr");
  await shoot(code, "desktop-devices-qr.png");

  const unset = await openDevices({ unconfigured: true });
  await unset.waitFor("id:devices-relay-reason");
  await shoot(unset, "desktop-devices-unconfigured.png");

  const expired = await openDevices({ expired: true });
  await expired.press("id:devices-add");
  await expired.waitFor("id:devices-expired");
  await shoot(expired, "desktop-devices-expired.png");

  const narrowList = await openDevices({ page: true }, phone);
  await narrowList.waitFor("id:devices-row-phone-1");
  await shoot(narrowList, "mobile-devices-list.png");

  const narrowCode = await openDevices({ page: true }, phone);
  await narrowCode.press("id:devices-add");
  await narrowCode.waitFor("id:devices-qr");
  await shoot(narrowCode, "mobile-devices-qr.png");
});
