/**
 * Settings against a real Host the app starts itself. It proves the providers
 * page writes a key through dsh's credentials and clears it, that a base URL
 * and the default model are stored in dsh's own settings and read back, that
 * the theme and accent persist across a relaunch, and that About shows the
 * versions the Host reports.
 *
 * Opt in with `MYAID_SMOKE_HOST=1`, a scratch home/data root and `myaid-host`
 * on PATH (see screens/README.md):
 *
 *   nsh test screens/settings-real-host.smoke.test.tsx --target macos
 *
 * The key is fake; clear it in the page (the flow does), then delete the
 * scratch root.
 */
import { expect, test } from "nsh/test";

import { open } from "../test/open";
import { hostSmokeRequested, shoot, SHOTS_L3 } from "./shots";

const KEY = "sk-l3-smoke-fake-0001";
const BASE_URL = "https://example.invalid/anthropic";

async function waitForProviders(app: Awaited<ReturnType<typeof open>>): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (app.shows("id:settings-provider-key")) return;
    if (app.shows("label:重试")) await app.press("label:重试");
    await app.wait(1000);
  }
  throw new Error(`providers never loaded: ${app.texts().join(" | ")}`);
}

test("a fake key round-trips, fields and the default model read back, appearance persists", async () => {
  if (!hostSmokeRequested()) return;
  const app = await open("../App.tsx", { width: 1440, height: 900, network: "live" });
  await app.waitFor("text:Host connected", { timeout: 180000 });
  await app.press("label:Settings");
  await app.waitFor("id:settings-overlay", { timeout: 30000 });
  await waitForProviders(app);
  await shoot(app, "settings-providers-real.png", SHOTS_L3);

  // Fake key → 已配置; clear → 未配置.
  await app.type("id:settings-provider-key", KEY);
  await app.press("label:保存 Key");
  await app.waitUntil(() => app.texts().filter((text) => text === "已配置").length >= 1, {
    timeout: 30000,
  });
  await app.press("label:清除 Key");
  await app.waitUntil(() => app.texts().filter((text) => text === "未配置").length >= 2, {
    timeout: 30000,
  });

  // A provider field writes into dsh's settings document.
  await app.clear("id:settings-provider-field-baseURL");
  await app.type("id:settings-provider-field-baseURL", BASE_URL);
  await app.press("label:保存字段");
  await app.waitFor("text:已保存 DeepSeek 的设置。", { timeout: 30000 });

  // The default model writes the namespace dsh reads defaults from.
  await app.press("label:默认模型 deepseek-official DeepSeek-V4-Pro");
  await app.waitFor("text:默认模型已设为 deepseek-official / deepseek-v4-pro。", {
    timeout: 30000,
  });

  // Close and reopen: both are read back from dsh, not from the page.
  await app.press("label:Back to Panes");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
  await app.press("label:Settings");
  await app.waitFor("id:settings-overlay");
  await waitForProviders(app);
  expect(app.value("id:settings-provider-field-baseURL")).toBe(BASE_URL);
  expect(app.texts()).toContain("当前：deepseek-official / deepseek-v4-pro");

  // General: apply and persist the dark scheme and the violet accent.
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  await app.press("text:深色");
  await app.press("label:强调色 紫");
  await app.waitUntil(() => {
    const prefs = app.storage()["myaid.prefs.shell"] ?? "";
    return prefs.includes('"scheme": "dark"') && prefs.includes('"accent": "violet"');
  });
  expect(String(app.spanStyle("text:强调色文字").color).toLowerCase()).toContain("a78bfa");

  // About: the versions the Host reports.
  await app.press("id:settings-nav-about");
  await app.waitFor("id:settings-about");
  expect(app.texts()).toContain("0.1.0");
  expect(app.texts()).toContain("0.2.2-rc.2");
  await app.press("label:复制诊断信息");
  const copied = app.clipboard() ?? "";
  expect(copied).toContain("MyAid: 0.1.0");
  expect(copied).toContain("Host: 0.1.0");
  expect(copied).toContain("dsh: 0.2.2-rc.2");
  await shoot(app, "settings-about-real.png", SHOTS_L3);

  // A relaunch on the prefs it wrote keeps the dark palette and the accent.
  const again = await open("../App.tsx", {
    width: 1440,
    height: 900,
    network: "live",
    storage: app.storage(),
  });
  await again.press("label:Settings");
  await again.waitFor("id:settings-overlay");
  await again.press("id:settings-nav-general");
  await again.waitFor("id:settings-general");
  expect(String(again.spanStyle("text:强调色文字").color).toLowerCase()).toContain("a78bfa");
}, 900000);
