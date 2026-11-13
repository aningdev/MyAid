/**
 * dsh's provider directory: the live routes plus the declared providers that
 * are not active yet. The Settings page reads this instead of a hard-coded
 * list; the join and its order are the only policy here.
 */
import type { LlmConfigurableProvider, LlmProviderInfo } from "@myaid/dsh-web-protocol/llm";

/** One provider row the Settings page shows: dsh's directory joined with its live route. */
export type ModelProviderEntry = {
  provider: string;
  displayName: string;
  /** The settings namespace whose section configures this provider. */
  settingsNs: string;
  /** Path from that namespace's section root to this provider's profile. */
  settingsPath: string[];
  /** A registered route serves now; otherwise it is a declared, dormant provider. */
  active: boolean;
  defaultBaseURL?: string;
  baseURLEnv?: string[];
  nativeAuth?: { env: string[]; oauth: boolean };
  error?: string;
};

/**
 * Join the live routes with the configurable-provider directory. The routes
 * contribute no settings address, so they only add rows no directory entry
 * declared; the directory keeps every declared provider, dormant or live.
 * DeepSeek Account and the official DeepSeek route lead, as dsh's own page
 * orders them; the rest keep the directory's order.
 */
export function joinProviderDirectory(
  registered: readonly LlmProviderInfo[],
  directory: readonly LlmConfigurableProvider[],
): ModelProviderEntry[] {
  const active = new Set(registered.map((provider) => provider.id));
  const declared = new Set(directory.map((entry) => entry.provider));
  const rows: ModelProviderEntry[] = directory.map((entry) => ({
    provider: entry.provider,
    displayName: entry.displayName,
    settingsNs: entry.settingsNs,
    settingsPath: [...entry.settingsPath],
    active: active.has(entry.provider),
    ...(entry.defaultBaseURL === undefined ? {} : { defaultBaseURL: entry.defaultBaseURL }),
    ...(entry.baseURLEnv === undefined ? {} : { baseURLEnv: [...entry.baseURLEnv] }),
    ...(entry.nativeAuth === undefined
      ? {}
      : { nativeAuth: { env: [...entry.nativeAuth.env], oauth: entry.nativeAuth.oauth } }),
    ...(entry.error === undefined ? {} : { error: entry.error }),
  }));
  for (const provider of registered) {
    if (declared.has(provider.id)) continue;
    rows.push({
      provider: provider.id,
      displayName: provider.name,
      settingsNs: "",
      settingsPath: [],
      active: true,
    });
  }
  return [...rows].sort(
    (left, right) =>
      (left.provider === "deepseek-account" ? 0 : left.provider === "deepseek-official" ? 1 : 2) -
      (right.provider === "deepseek-account" ? 0 : right.provider === "deepseek-official" ? 1 : 2),
  );
}
