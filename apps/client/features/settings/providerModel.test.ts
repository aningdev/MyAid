import { expect, test } from "nsh/test";

import { t } from "../../lib/i18n";
import {
  providerDirectoryFixture,
  settingsFixture,
  modelCatalogFixture,
} from "../../test/settings-fixtures";
import {
  credentialLabel,
  defaultModelNamespace,
  defaultModelOf,
  defaultModelOptions,
  derivedKeyRef,
  nestedPatch,
  providerFields,
  providerKeyRef,
  providerProfile,
} from "./providerModel";

const entries = providerDirectoryFixture();
const settings = settingsFixture();
const deepseek = entries.find((entry) => entry.provider === "deepseek-official")!;
const anthropic = entries.find((entry) => entry.provider === "anthropic")!;

test("a provider's key reference comes from its profile, else dsh's derivation", () => {
  expect(providerProfile(settings, deepseek)?.apiKeyEnv).toBe("DEEPSEEK_API_KEY");
  expect(providerKeyRef(deepseek, providerProfile(settings, deepseek))).toBe("DEEPSEEK_API_KEY");
  expect(providerProfile(settings, anthropic)).toBe(undefined);
  expect(providerKeyRef(anthropic, undefined)).toBe("ANTHROPIC_API_KEY");
  expect(derivedKeyRef("minimax-cn")).toBe("MINIMAX_CN_API_KEY");
});

test("the fields are the schema's scalars, with the api key kept out", () => {
  const fields = providerFields(settings, deepseek);
  expect(fields.map((field) => field.key)).toEqual(["baseURL", "thinking", "maxTokens"]);
  const thinking = fields.find((field) => field.key === "thinking")!;
  expect(thinking.kind).toBe("choice");
  expect(thinking.value).toBe("enabled");
  expect(thinking.choices?.map((choice) => choice.value)).toEqual(["enabled", "disabled"]);
  expect(fields.find((field) => field.key === "maxTokens")?.value).toBe(256000);
});

test("a patch nests under the provider's settings path", () => {
  expect(nestedPatch([], { baseURL: "http://x" })).toEqual({ baseURL: "http://x" });
  expect(nestedPatch(["providers", "anthropic"], { apiKeyEnv: "A_KEY" })).toEqual({
    providers: { anthropic: { apiKeyEnv: "A_KEY" } },
  });
});

test("the default model namespace and its value come from dsh", () => {
  const view = defaultModelNamespace(settings);
  expect(view?.ns).toBe("agent-default-model");
  expect(defaultModelOf(view)).toEqual({ provider: "deepseek-official", model: "deepseek-flash" });
  expect(defaultModelOf(undefined)).toBe(null);
});

test("default model choices merge the catalog with dsh's declared models", () => {
  const options = defaultModelOptions(modelCatalogFixture().models, settings, entries, {
    provider: "deepseek-official",
    model: "deepseek-flash",
  });
  const keys = options.map((option) => `${option.provider}/${option.model}`);
  expect(keys).toContain("deepseek-official/deepseek-flash");
  expect(keys).toContain("deepseek-official/deepseek-v4-pro");
  expect(new Set(keys).size).toBe(keys.length);
});

test("the key state reads as the product's words", () => {
  expect(credentialLabel({ configured: true, writable: true })).toBe(
    t("providers.credentialConfigured"),
  );
  expect(credentialLabel({ configured: false, writable: true })).toBe(
    t("providers.credentialMissing"),
  );
  expect(credentialLabel(undefined)).toBe(t("providers.credentialChecked"));
});
