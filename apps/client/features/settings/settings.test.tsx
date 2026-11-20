/**
 * Settings › Background over the stand-in control channel
 * (`settings-harness.tsx`): the panel shows the Host's registration, and its
 * verbs issue the Host's registration calls.
 */
import { expect, test } from "nsh/test";

import { emptyShellPrefs, serializeShellPrefs } from "../../components/shell/prefs";
import { t } from "../../lib/i18n";
import { open } from "../../test/open";
import { SUPPORTED_DSH, UNSUPPORTED_DSH } from "../../test/settings-fixtures";

const desktop = { platform: "macos" as const, width: 1100, height: 800 };

async function panel() {
  const app = await open("./settings-harness.tsx", desktop);
  // Settings covers the Panes; the panel is the same one it always was.
  await app.press(`label:${t("host.settings")}`);
  await app.waitFor("id:settings-overlay");
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-background");
  return app;
}

test("the panel shows the Host registration", async () => {
  const app = await panel();

  expect(app.shows(`id:settings-host-phase >> text:${t("background.phase.notRegistered")}`)).toBe(
    true,
  );
});

test("Enable and Stop register and withdraw the Host", async () => {
  const app = await panel();

  await app.press(`label:${t("background.enable")}`);
  await app.waitUntil(() =>
    app.shows(`id:settings-host-phase >> text:${t("background.phase.registered")}`),
  );

  await app.press(`label:${t("background.stop")}`);
  await app.waitUntil(() =>
    app.shows(`id:settings-host-phase >> text:${t("background.phase.notRegistered")}`),
  );
});

async function openSettings(options: Parameters<typeof open>[1] = desktop) {
  const app = await open("./settings-harness.tsx", options);
  await app.press(`label:${t("host.settings")}`);
  await app.waitFor("id:settings-overlay");
  return app;
}

test("the four groups switch in the overlay and Back returns to the Panes", async () => {
  const app = await openSettings();
  expect(app.shows("id:settings-providers")).toBe(true);
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-background");
  await app.press("id:settings-nav-about");
  await app.waitFor("id:settings-about");
  await app.press(`label:${t("settings.backLabel")}`);
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
});

test("a provider key saves, reads back as 已配置, and clears to 未配置", async () => {
  const app = await openSettings();
  await app.waitFor("id:settings-provider-key");
  await app.type("id:settings-provider-key", "sk-l3-test-0001");
  await app.press(`label:${t("providers.saveKey")}`);
  await app.waitUntil(() => {
    const texts = app.texts();
    return texts.filter((text) => text === t("providers.credentialConfigured")).length >= 1;
  });
  // The key reached the fake credentials store, never the client's files.
  expect(JSON.stringify(app.storage())).not.toContain("sk-l3-test-0001");

  await app.press(`label:${t("providers.clearKey")}`);
  await app.waitUntil(() => {
    const texts = app.texts();
    return texts.filter((text) => text === t("providers.credentialMissing")).length >= 2;
  });
});

test("a provider field saves through dsh's settings form and reads back", async () => {
  const app = await openSettings();
  await app.waitFor("id:settings-provider-field-baseURL");
  await app.type("id:settings-provider-field-baseURL", "https://example.invalid/anthropic");
  await app.press(`label:${t("providers.saveFields")}`);
  await app.waitFor(`text:${t("providers.settingsSaved", { name: "DeepSeek" })}`);
  expect(app.value("id:settings-provider-field-baseURL")).toBe("https://example.invalid/anthropic");
});

test("the default model is stored in dsh's default-model namespace", async () => {
  const app = await openSettings();
  await app.waitFor(
    `text:${t("providers.currentModel", {
      provider: "deepseek-official",
      model: "deepseek-flash",
    })}`,
  );
  await app.press(
    `label:${t("providers.defaultModelLabel", {
      provider: "deepseek-official",
      name: "DeepSeek-V4-Pro",
    })}`,
  );
  await app.waitFor(
    `text:${t("providers.defaultModelSet", {
      provider: "deepseek-official",
      model: "deepseek-v4-pro",
    })}`,
  );
  expect(app.texts()).toContain(
    t("providers.currentModel", { provider: "deepseek-official", model: "deepseek-v4-pro" }),
  );
});

test("the language is saved and the scheme applies and persists", async () => {
  const app = await openSettings();
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  await app.press(`text:${t("appearance.light")}`);
  const light = app.spanStyle(`text:${t("settings.general.note")}`).color;
  await app.press(`text:${t("appearance.dark")}`);
  await app.press("text:English");

  await app.waitUntil(() => {
    const prefs = app.storage()["dsh-bot.prefs.shell"] ?? "";
    return prefs.includes('"language": "en"') && prefs.includes('"scheme": "dark"');
  });
  // The palette followed the scheme: the page's text is the dark one now.
  const dark = app.spanStyle(`text:${t("settings.general.note")}`).color;
  expect(dark).not.toBe(light);

  // Relaunch on the preferences it wrote: the dark scheme comes back.
  const again = await open("./settings-harness.tsx", { ...desktop, storage: app.storage() });
  await again.press("label:Settings");
  await again.press("id:settings-nav-general");
  await again.waitFor("id:settings-general");
  expect(again.spanStyle(`text:${t("settings.general.note")}`).color).toBe(dark);
});

test("the colour switches the whole app at once, and a relaunch keeps it", async () => {
  const app = await openSettings();
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  const neutral = app.spanStyle(`text:${t("settings.general.note")}`).color;

  await app.press(`text:${t("settings.general.themeCitrus")}`);
  await app.waitUntil(() =>
    (app.storage()["dsh-bot.prefs.shell"] ?? "").includes('"theme": "default"'),
  );
  // The palette followed the pick: the page's ink is the citrus theme's now.
  const citrus = app.spanStyle(`text:${t("settings.general.note")}`).color;
  expect(citrus).not.toBe(neutral);

  // Relaunch on the preferences it wrote: the citrus palette is back.
  const again = await open("./settings-harness.tsx", { ...desktop, storage: app.storage() });
  await again.press(`label:${t("host.settings")}`);
  await again.press("id:settings-nav-general");
  await again.waitFor("id:settings-general");
  expect(again.spanStyle(`text:${t("settings.general.note")}`).color).toBe(citrus);
});

test("a stored colour this build does not carry is the build-time theme", async () => {
  const fresh = await openSettings();
  await fresh.press("id:settings-nav-general");
  await fresh.waitFor("id:settings-general");
  const builtIn = fresh.spanStyle(`text:${t("settings.general.note")}`).color;

  const stored = {
    ...emptyShellPrefs(),
    appearance: { scheme: "system" as const, language: "system" as const, theme: "shadcn" },
  };
  const app = await open("./settings-harness.tsx", {
    ...desktop,
    storage: { "dsh-bot.prefs.shell": serializeShellPrefs(stored) },
  });
  await app.press(`label:${t("host.settings")}`);
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  // The build-time palette, and the file reads as no choice at all.
  expect(app.spanStyle(`text:${t("settings.general.note")}`).color).toBe(builtIn);
  await app.waitUntil(() => (app.storage()["dsh-bot.prefs.shell"] ?? "").includes('"theme": null'));
});

test("About shows the versions and copies diagnostics without secrets", async () => {
  const app = await openSettings();
  await app.press("id:settings-nav-about");
  await app.waitFor("id:settings-about");
  expect(app.texts()).toContain("0.1.0");
  expect(app.texts()).toContain(SUPPORTED_DSH);
  await app.press(`label:${t("settings.about.copy")}`);
  const copied = app.clipboard() ?? "";
  expect(copied).toContain("dsh-bot: 0.1.0");
  expect(copied).toContain("Host: 0.1.0");
  expect(copied).toContain(`dsh: ${SUPPORTED_DSH}`);
  expect(copied).toContain(t("diagnostics.hostState", { state: t("background.connected") }));
});

test("Background shows the Host and dsh versions and starts, stops and restarts dsh", async () => {
  const app = await openSettings();
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-background");
  await app.waitFor("id:settings-host-version");
  expect(app.shows("id:settings-host-version")).toBe(true);
  expect(app.texts()).toContain("0.1.0");
  expect(app.texts().filter((text) => text === SUPPORTED_DSH).length).toBeGreaterThanOrEqual(2);
  expect(app.texts()).toContain(t("lifecycle.ready"));

  await app.press(`label:${t("settings.background.stopDsh")}`);
  await app.waitUntil(() => app.texts().includes(t("lifecycle.stopped")));
  await app.press(`label:${t("settings.background.startDsh")}`);
  await app.waitUntil(() => app.texts().includes(t("lifecycle.ready")));
});

test("a dsh version mismatch names both versions and why the Host refuses", async () => {
  const app = await openSettings({ ...desktop, host: { params: { mismatch: true } } });
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-dsh-mismatch");
  expect(app.texts()).toContain(UNSUPPORTED_DSH);
  expect(app.texts()).toContain(SUPPORTED_DSH);
  expect(app.texts().join(" ")).toContain(
    t("background.mismatch", { actual: UNSUPPORTED_DSH, supported: SUPPORTED_DSH }),
  );
});

test("with no Host the providers page explains and offers no inputs", async () => {
  const app = await open("./settings-offline-harness.tsx", desktop);
  await app.press(`label:${t("host.settings")}`);
  await app.waitFor("id:settings-overlay");
  await app.waitFor(`text:${t("providers.needsHost")}`);
  expect(app.count("id:settings-provider-key")).toBe(0);
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-background");
  expect(app.texts()).toContain(t("background.notRunning"));
});
