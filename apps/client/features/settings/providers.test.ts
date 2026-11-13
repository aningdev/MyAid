/**
 * Settings › Model providers over a fake dsh: the directory, the settings
 * document and the credential store answer the shapes the Host sends. The
 * key's one destination is `setCredential`; the page's state and the client's
 * prefs never hold it.
 */
import { afterEach, expect, test } from "nsh/test";

import { collectShellPrefs, serializeShellPrefs } from "../../components/shell/prefs";
import { createSettingsFixture } from "../../test/settings-fixtures";
import {
  clearProviderKey,
  currentDefault,
  keyProblem,
  loadProviders,
  providersState,
  saveDefaultModel,
  saveProviderFields,
  saveProviderKey,
  setProvidersSource,
  type ProvidersSource,
} from "./providers";

afterEach(() => {
  setProvidersSource(null);
});

const KEY = "sk-unit-test-4321";

test("the page joins the directory, the settings and the keys", async () => {
  setProvidersSource(createSettingsFixture().source);
  const state = await loadProviders();
  expect(state.phase).toBe("ready");
  expect(state.rows.map((row) => row.entry.provider)).toEqual([
    "deepseek-account",
    "deepseek-official",
    "anthropic",
  ]);
  expect(state.rows[1]?.keyRef).toBe("DEEPSEEK_API_KEY");
  expect(state.rows[2]?.keyRef).toBe("ANTHROPIC_API_KEY");
  expect(state.defaultNs?.ns).toBe("agent-default-model");
  expect(state.rows[2]?.credential?.configured).toBe(false);
});

test("a saved key is 已配置, never in the page's state or the client prefs", async () => {
  const fixture = createSettingsFixture();
  setProvidersSource(fixture.source);
  await loadProviders();
  expect(await saveProviderKey("deepseek-official", KEY)).toBe(true);
  const row = providersState().rows.find((item) => item.entry.provider === "deepseek-official");
  expect(row?.credential?.configured).toBe(true);
  expect(fixture.written).toEqual([{ ref: "DEEPSEEK_API_KEY", value: KEY }]);
  // The client's own files and this page's state never see the key.
  expect(serializeShellPrefs(collectShellPrefs())).not.toContain(KEY);
  expect(JSON.stringify(providersState())).not.toContain(KEY);
  expect(providersState().message).toContain("已保存");

  expect(await clearProviderKey("deepseek-official")).toBe(true);
  const cleared = providersState().rows.find((item) => item.entry.provider === "deepseek-official");
  expect(cleared?.credential?.configured).toBe(false);
});

test("a dormant provider's key records the derived reference in its profile", async () => {
  const fixture = createSettingsFixture();
  setProvidersSource(fixture.source);
  await loadProviders();
  expect(await saveProviderKey("anthropic", KEY)).toBe(true);
  expect(fixture.patches).toContainEqual({
    ns: "llm-pi-ai",
    patch: { providers: { anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY" } } },
  });
});

test("a typed key is judged before any write", async () => {
  expect(keyProblem("")).toContain("请输入");
  expect(keyProblem("A=B")).toContain("ASCII");
  expect(keyProblem("sk-ok key")).toContain("ASCII");
  expect(keyProblem(KEY)).toBe(null);
});

test("provider fields and the default model write through the settings Remote", async () => {
  const fixture = createSettingsFixture();
  setProvidersSource(fixture.source);
  await loadProviders();
  expect(await saveProviderFields("deepseek-official", { baseURL: "http://127.0.0.1:9" })).toBe(
    true,
  );
  expect(fixture.patches).toContainEqual({
    ns: "llm-deepseek",
    patch: { baseURL: "http://127.0.0.1:9" },
  });
  expect(providersState().message).toContain("已保存");

  expect(await saveDefaultModel("deepseek-official", "deepseek-v4-pro")).toBe(true);
  expect(currentDefault()).toEqual({ provider: "deepseek-official", model: "deepseek-v4-pro" });
  expect(fixture.patches).toContainEqual({
    ns: "agent-default-model",
    patch: { provider: "deepseek-official", model: "deepseek-v4-pro" },
  });
});

test("no Host means the unavailable state, not an exception", async () => {
  const offline = (() => Promise.reject(new Error("宿主未运行：请先启动 Host"))) as never;
  const source: ProvidersSource = {
    listProviders: offline,
    describeSettings: offline,
    describeCredentials: offline,
    updateSettings: offline,
    setCredential: offline,
    unsetCredential: offline,
    modelCatalog: offline,
  };
  setProvidersSource(source);
  const state = await loadProviders();
  expect(state.phase).toBe("unavailable");
  expect(state.error).toContain("宿主");
  expect(state.rows).toEqual([]);
});
