import type {
  CredentialInfo,
  SettingsDescribeValue,
  SettingsNamespaceView,
} from "@myaid/dsh-web-protocol/settings";
/**
 * Settings › Model providers: the page's state. It joins what dsh says about
 * its providers (the route directory, the settings namespaces, the effective
 * profile) with the redacted credential facts, and every write goes back
 * through the official Remotes. The API key lives only in the credentials
 * store: the draft is handed to `setCredential` and never held here, never in
 * prefs, and never in the registry.
 */
import { signal } from "nsh";

import type { FlatCatalogModel, FlatModelCatalog } from "../../lib/dsh/connection";
import type { ModelProviderEntry } from "../../lib/dsh/providers";
import {
  credentialLabel,
  defaultModelNamespace,
  defaultModelOf,
  nestedPatch,
  providerFields,
  providerKeyRef,
  providerNamespace,
  providerProfile,
} from "./providerModel";

/** What one provider row shows after the settings and credential reads. */
export type ProviderRow = {
  entry: ModelProviderEntry;
  keyRef: string;
  /** The profile dsh resolves for the route; absent while a dormant route has none. */
  hasProfile: boolean;
  /** The account route signs in elsewhere; it has no key to write. */
  account: boolean;
  credential?: CredentialInfo;
};

export type ProvidersState = {
  phase: "idle" | "loading" | "ready" | "unavailable" | "error";
  error: string | null;
  /** dsh's own writability: false disables every settings write. */
  writable: boolean;
  rows: ProviderRow[];
  settings: SettingsDescribeValue | null;
  catalog: FlatCatalogModel[] | null;
  /** The namespace dsh uses for the default selection. */
  defaultNs: SettingsNamespaceView | null;
  /** The route an action is running for; `"default"` while saving the default. */
  busy: string | null;
  /** The last action's confirmation, for the page's status line. */
  message: string | null;
  actionError: string | null;
};

/** The calls the page needs; a test injects a fake, production uses the Connection. */
export type ProvidersSource = {
  listProviders(): Promise<ModelProviderEntry[]>;
  describeSettings(): Promise<SettingsDescribeValue>;
  describeCredentials(refs: string[]): Promise<Record<string, CredentialInfo>>;
  updateSettings(
    ns: string,
    patch: Record<string, unknown>,
    revision?: number,
  ): Promise<SettingsNamespaceView>;
  setCredential(ref: string, value: string): Promise<void>;
  unsetCredential(ref: string): Promise<void>;
  modelCatalog(): Promise<FlatModelCatalog>;
};

const initial: ProvidersState = {
  phase: "idle",
  error: null,
  writable: false,
  rows: [],
  settings: null,
  catalog: null,
  defaultNs: null,
  busy: null,
  message: null,
  actionError: null,
};

export const providersState = signal<ProvidersState>(initial);

let injected: ProvidersSource | undefined;

/** Tests replace the Connection with a fake; `null` restores the live source. */
export function setProvidersSource(next: ProvidersSource | null): void {
  injected = next ?? undefined;
}

/** The message a page shows when dsh is not reachable at all. */
export const PROVIDERS_NEED_HOST = "需要连接 Host 才能配置供应商。";

async function liveSource(): Promise<ProvidersSource> {
  const { ensureConnected } = await import("../../lib/dsh/session");
  const connection = await ensureConnected();
  return {
    listProviders: () => connection.listModelProviders(),
    describeSettings: () => connection.describeSettings(),
    describeCredentials: (refs) => connection.describeCredentials(refs),
    updateSettings: (ns, patch, revision) => connection.updateSettings(ns, patch, revision),
    setCredential: (ref, value) => connection.setCredential(ref, value),
    unsetCredential: (ref) => connection.unsetCredential(ref),
    modelCatalog: () => connection.modelCatalog(),
  };
}

function rowsOf(
  entries: readonly ModelProviderEntry[],
  settings: SettingsDescribeValue,
  credentials: Record<string, CredentialInfo>,
): ProviderRow[] {
  return entries.map((entry) => {
    const profile = providerProfile(settings, entry);
    const account = entry.provider === "deepseek-account";
    const keyRef = providerKeyRef(entry, profile);
    return {
      entry,
      keyRef,
      hasProfile: profile !== undefined,
      account,
      ...(account || credentials[keyRef] === undefined ? {} : { credential: credentials[keyRef] }),
    };
  });
}

function replaceNamespace(
  settings: SettingsDescribeValue,
  view: SettingsNamespaceView,
): SettingsDescribeValue {
  return {
    ...settings,
    namespaces: settings.namespaces.map((current) => (current.ns === view.ns ? view : current)),
  };
}

function applyDerived(state: ProvidersState, settings: SettingsDescribeValue): ProvidersState {
  const credentials = Object.fromEntries(
    state.rows
      .filter((row) => row.credential !== undefined)
      .map((row) => [row.keyRef, row.credential as CredentialInfo]),
  );
  return {
    ...state,
    settings,
    writable: settings.writable,
    rows: rowsOf(
      state.rows.map((row) => row.entry),
      settings,
      credentials,
    ),
    defaultNs: defaultModelNamespace(settings) ?? null,
  };
}

/** Read the provider directory, the settings document, the catalog and the keys. */
export async function loadProviders(): Promise<ProvidersState> {
  providersState.set({ ...initial, phase: "loading" });
  try {
    const source = injected ?? (await liveSource());
    const [entries, settings] = await Promise.all([
      source.listProviders(),
      source.describeSettings(),
    ]);
    const catalog = await source.modelCatalog().catch(() => null);
    let credentials: Record<string, CredentialInfo> = {};
    try {
      const refs = entries
        .filter((entry) => entry.provider !== "deepseek-account")
        .map((entry) => providerKeyRef(entry, providerProfile(settings, entry)));
      credentials = await source.describeCredentials([...new Set(refs)]);
    } catch {
      // The credential store may be absent; rows still read and edit settings.
    }
    const next: ProvidersState = {
      ...initial,
      phase: "ready",
      writable: settings.writable,
      settings,
      rows: rowsOf(entries, settings, credentials),
      catalog: catalog?.models ?? null,
      defaultNs: defaultModelNamespace(settings) ?? null,
    };
    providersState.set(next);
    return next;
  } catch (error) {
    const message = errorMessage(error);
    const next: ProvidersState = {
      ...initial,
      phase: /宿主|Host|连接/.test(message) ? "unavailable" : "error",
      error: message,
    };
    providersState.set(next);
    return next;
  }
}

/** Judge a typed key with dsh's own rule: printable ASCII, no pasted env line. */
export function keyProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "请输入 API Key。";
  if (!/^[!-~]+$/.test(value) || /^[A-Z][A-Z0-9_]*=[^=]/.test(value)) {
    return "API Key 只能包含可见 ASCII 字符，且不能是整行环境变量。";
  }
  return null;
}

/** Store one provider's key; also records the derived reference when the profile names none. */
export async function saveProviderKey(provider: string, raw: string): Promise<boolean> {
  const problem = keyProblem(raw);
  if (problem) {
    providersState.set({ ...providersState(), actionError: problem, message: null });
    return false;
  }
  const state = providersState();
  const row = state.rows.find((item) => item.entry.provider === provider);
  if (!row || !state.settings) return false;
  const key = raw.trim();
  providersState.set({ ...state, busy: provider, actionError: null, message: null });
  try {
    const source = injected ?? (await liveSource());
    let settings = state.settings;
    const named = providerProfile(settings, row.entry)?.apiKeyEnv;
    if (typeof named !== "string" || !named.trim()) {
      const view = providerNamespace(settings, row.entry);
      if (!view) throw new Error("dsh 没有为这个供应商提供设置表单。");
      const updated = await source.updateSettings(
        view.ns,
        nestedPatch(row.entry.settingsPath, { apiKeyEnv: row.keyRef }),
        view.revision,
      );
      settings = replaceNamespace(settings, updated);
    }
    await source.setCredential(row.keyRef, key);
    const credentials = await source
      .describeCredentials([row.keyRef])
      .catch(() => ({}) as Record<string, CredentialInfo>);
    const next = applyDerived(
      {
        ...providersState(),
        busy: null,
        message: `已保存 ${row.entry.displayName} 的 API Key。`,
        actionError: null,
      },
      settings,
    );
    next.rows = next.rows.map((item) =>
      item.entry.provider === provider && credentials[row.keyRef]
        ? { ...item, credential: credentials[row.keyRef] }
        : item,
    );
    providersState.set(next);
    return true;
  } catch (error) {
    providersState.set({
      ...providersState(),
      busy: null,
      message: null,
      actionError: errorMessage(error),
    });
    return false;
  }
}

/** Remove one provider's stored key. */
export async function clearProviderKey(provider: string): Promise<boolean> {
  const state = providersState();
  const row = state.rows.find((item) => item.entry.provider === provider);
  if (!row) return false;
  providersState.set({ ...state, busy: provider, actionError: null, message: null });
  try {
    const source = injected ?? (await liveSource());
    await source.unsetCredential(row.keyRef);
    const credentials = await source
      .describeCredentials([row.keyRef])
      .catch(() => ({}) as Record<string, CredentialInfo>);
    const next = {
      ...providersState(),
      busy: null,
      message: `已清除 ${row.entry.displayName} 的 API Key。`,
      actionError: null,
    };
    next.rows = next.rows.map((item) =>
      item.entry.provider === provider
        ? { ...item, credential: credentials[row.keyRef] ?? { configured: false, writable: true } }
        : item,
    );
    providersState.set(next);
    return true;
  } catch (error) {
    providersState.set({
      ...providersState(),
      busy: null,
      message: null,
      actionError: errorMessage(error),
    });
    return false;
  }
}

/** Merge changed provider fields into the namespace's user section. */
export async function saveProviderFields(
  provider: string,
  values: Record<string, unknown>,
): Promise<boolean> {
  const state = providersState();
  const row = state.rows.find((item) => item.entry.provider === provider);
  if (!row || !state.settings) return false;
  const view = providerNamespace(state.settings, row.entry);
  if (!view) return false;
  providersState.set({ ...state, busy: provider, actionError: null, message: null });
  try {
    const source = injected ?? (await liveSource());
    const updated = await source.updateSettings(
      view.ns,
      nestedPatch(row.entry.settingsPath, values),
      view.revision,
    );
    providersState.set({
      ...applyDerived(
        {
          ...providersState(),
          busy: null,
          message: `已保存 ${row.entry.displayName} 的设置。`,
          actionError: null,
        },
        replaceNamespace(state.settings, updated),
      ),
    });
    return true;
  } catch (error) {
    providersState.set({
      ...providersState(),
      busy: null,
      message: null,
      actionError: errorMessage(error),
    });
    return false;
  }
}

/** Store the default model selection in the namespace dsh reads it from. */
export async function saveDefaultModel(provider: string, model: string): Promise<boolean> {
  const state = providersState();
  const view = state.defaultNs;
  if (!view) {
    providersState.set({ ...state, actionError: "dsh 没有报告默认模型设置。" });
    return false;
  }
  providersState.set({ ...state, busy: "default", actionError: null, message: null });
  try {
    const source = injected ?? (await liveSource());
    const updated = await source.updateSettings(view.ns, { provider, model }, view.revision);
    providersState.set(
      applyDerived(
        {
          ...providersState(),
          busy: null,
          message: `默认模型已设为 ${provider} / ${model}。`,
          actionError: null,
        },
        replaceNamespace(
          state.settings ?? { writable: true, hasDocument: false, namespaces: [] },
          updated,
        ),
      ),
    );
    return true;
  } catch (error) {
    providersState.set({
      ...providersState(),
      busy: null,
      message: null,
      actionError: errorMessage(error),
    });
    return false;
  }
}

/** The current default, for the default-model card. */
export function currentDefault(): { provider: string; model: string } | null {
  return defaultModelOf(providersState().defaultNs ?? undefined);
}

/** The label a row shows for its key. */
export function rowKeyLabel(row: ProviderRow): string {
  return row.account ? "账号" : credentialLabel(row.credential);
}

/** The fields a provider's card edits, from the schema dsh sent. */
export function fieldsOf(row: ProviderRow): ReturnType<typeof providerFields> {
  return providerFields(providersState().settings, row.entry);
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^[a-z0-9-]+\/[a-z0-9-]+:\s*/i, "");
}
