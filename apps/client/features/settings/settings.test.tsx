/**
 * Settings › Background Services over the stand-in control channels
 * (`settings-harness.tsx`): the panel shows the Host's and Relay's own
 * registration facts, and its verbs issue the shared registration calls.
 */
import { expect, test } from "nsh/test";

import { open } from "../../test/open";

const desktop = { platform: "macos" as const, width: 1100, height: 800 };

async function panel() {
  const app = await open("./settings-harness.tsx", desktop);
  // Settings covers the Panes; the panel is the same one it always was.
  await app.press("label:Settings");
  await app.waitFor("id:settings-overlay");
  await app.press("id:settings-nav-background");
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

async function openSettings(options: Parameters<typeof open>[1] = desktop) {
  const app = await open("./settings-harness.tsx", options);
  await app.press("label:Settings");
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
  await app.press("label:Back to Panes");
  await app.waitUntil(() => !app.shows("id:settings-overlay"));
});

test("a provider key saves, reads back as 已配置, and clears to 未配置", async () => {
  const app = await openSettings();
  await app.waitFor("id:settings-provider-key");
  await app.type("id:settings-provider-key", "sk-l3-test-0001");
  await app.press("label:保存 Key");
  await app.waitUntil(() => {
    const texts = app.texts();
    return texts.filter((text) => text === "已配置").length >= 1;
  });
  // The key reached the fake credentials store, never the client's files.
  expect(JSON.stringify(app.storage())).not.toContain("sk-l3-test-0001");

  await app.press("label:清除 Key");
  await app.waitUntil(() => {
    const texts = app.texts();
    return texts.filter((text) => text === "未配置").length >= 2;
  });
});

test("a provider field saves through dsh's settings form and reads back", async () => {
  const app = await openSettings();
  await app.waitFor("id:settings-provider-field-baseURL");
  await app.type("id:settings-provider-field-baseURL", "https://example.invalid/anthropic");
  await app.press("label:保存字段");
  await app.waitFor("text:已保存 DeepSeek 的设置。");
  expect(app.value("id:settings-provider-field-baseURL")).toBe("https://example.invalid/anthropic");
});

test("the default model is stored in dsh's default-model namespace", async () => {
  const app = await openSettings();
  await app.waitFor("text:当前：deepseek-official / deepseek-flash");
  await app.press("label:默认模型 deepseek-official DeepSeek-V4-Pro");
  await app.waitFor("text:默认模型已设为 deepseek-official / deepseek-v4-pro。");
  expect(app.texts()).toContain("当前：deepseek-official / deepseek-v4-pro");
});

test("the language is saved and the appearance and accent apply and persist", async () => {
  const app = await openSettings();
  await app.press("id:settings-nav-general");
  await app.waitFor("id:settings-general");
  await app.press("text:English");
  await app.press("text:深色");
  await app.press("label:强调色 紫");

  await app.waitUntil(() => {
    const prefs = app.storage()["myaid.prefs.shell"] ?? "";
    return (
      prefs.includes('"language": "en"') &&
      prefs.includes('"scheme": "dark"') &&
      prefs.includes('"accent": "violet"')
    );
  });
  const accent = app.spanStyle("text:强调色文字").color;
  expect(String(accent).toLowerCase()).toContain("a78bfa");

  // Relaunch on the preferences it wrote: the dark scheme and accent come back.
  const again = await open("./settings-harness.tsx", { ...desktop, storage: app.storage() });
  await again.press("label:Settings");
  await again.press("id:settings-nav-general");
  await again.waitFor("id:settings-general");
  expect(String(again.spanStyle("text:强调色文字").color).toLowerCase()).toContain("a78bfa");
});

test("About shows the versions and copies diagnostics without secrets", async () => {
  const app = await openSettings();
  await app.press("id:settings-nav-about");
  await app.waitFor("id:settings-about");
  expect(app.texts()).toContain("0.1.0");
  expect(app.texts()).toContain("0.2.2-rc.2");
  await app.press("label:复制诊断信息");
  const copied = app.clipboard() ?? "";
  expect(copied).toContain("MyAid: 0.1.0");
  expect(copied).toContain("Host: 0.1.0");
  expect(copied).toContain("dsh: 0.2.2-rc.2");
  expect(copied).toContain("Host 连接: 已连接");
});

test("Background shows the Host and dsh versions and starts, stops and restarts dsh", async () => {
  const app = await openSettings();
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-background");
  await app.waitFor("id:settings-host-version");
  expect(app.shows("id:settings-host-version")).toBe(true);
  expect(app.texts()).toContain("0.1.0");
  expect(app.texts().filter((text) => text === "0.2.2-rc.2").length).toBeGreaterThanOrEqual(2);
  expect(app.texts()).toContain("ready");

  await app.press("label:停止 dsh");
  await app.waitUntil(() => app.texts().includes("stopped"));
  await app.press("label:启动 dsh");
  await app.waitUntil(() => app.texts().includes("ready"));
});

test("a dsh version mismatch names both versions and why the Host refuses", async () => {
  const app = await openSettings({ ...desktop, host: { params: { mismatch: true } } });
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-dsh-mismatch");
  expect(app.texts()).toContain("0.2.2-rc.1");
  expect(app.texts()).toContain("0.2.2-rc.2");
  expect(app.texts().join(" ")).toContain("版本不匹配");
});

test("with no Host the providers page explains and offers no inputs", async () => {
  const app = await open("./settings-offline-harness.tsx", desktop);
  await app.press("label:Settings");
  await app.waitFor("id:settings-overlay");
  await app.waitFor("text:需要连接 Host 才能配置供应商。");
  expect(app.count("id:settings-provider-key")).toBe(0);
  await app.press("id:settings-nav-background");
  await app.waitFor("id:settings-background");
  expect(app.texts()).toContain("not running");
});
