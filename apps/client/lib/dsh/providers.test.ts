import { expect, test } from "nsh/test";

import { joinProviderDirectory } from "./providers";

test("the directory keeps declared providers and appends undeclared live routes", () => {
  const rows = joinProviderDirectory(
    [
      { id: "deepseek-official", name: "DeepSeek" },
      { id: "custom-live", name: "Custom" },
    ],
    [
      {
        provider: "deepseek-official",
        displayName: "DeepSeek",
        settingsNs: "llm-deepseek",
        settingsPath: [],
      },
      {
        provider: "anthropic",
        displayName: "anthropic",
        settingsNs: "llm-pi-ai",
        settingsPath: ["providers", "anthropic"],
        defaultBaseURL: "https://api.anthropic.com",
      },
    ],
  );
  expect(rows.map((row) => row.provider)).toEqual([
    "deepseek-official",
    "anthropic",
    "custom-live",
  ]);
  expect(rows[0]?.active).toBe(true);
  expect(rows[1]?.active).toBe(false);
  expect(rows[1]?.settingsPath).toEqual(["providers", "anthropic"]);
  expect(rows[2]?.settingsNs).toBe("");
});

test("DeepSeek Account leads, then the official route, then the rest", () => {
  const rows = joinProviderDirectory(
    [],
    [
      {
        provider: "anthropic",
        displayName: "anthropic",
        settingsNs: "llm-pi-ai",
        settingsPath: ["providers", "anthropic"],
      },
      {
        provider: "deepseek-official",
        displayName: "DeepSeek",
        settingsNs: "llm-deepseek",
        settingsPath: [],
      },
      {
        provider: "deepseek-account",
        displayName: "DeepSeek Account",
        settingsNs: "llm-deepseek-account",
        settingsPath: [],
      },
    ],
  );
  expect(rows.map((row) => row.provider)).toEqual([
    "deepseek-account",
    "deepseek-official",
    "anthropic",
  ]);
});
