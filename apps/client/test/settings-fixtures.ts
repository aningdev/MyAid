/**
 * The Settings tests' fake Host: dsh's own snapshot shapes (two live routes,
 * one dormant declared route, the default-model namespace) and the credential
 * store behind them. `updateSettings` deep-merges the patch the way dsh's
 * settings service does, so a saved field reads back from `describe`.
 */
import type {
  CredentialInfo,
  SettingsDescribeValue,
  SettingsNamespaceView,
} from "@dsh-bot/dsh-web-protocol/settings";

import dshPin from "../../host/supported-dsh.json";
import type { HostFactsSource } from "../features/settings/hostFacts";
import type { ProvidersSource } from "../features/settings/providers";
import type { FlatModelCatalog } from "../lib/dsh/connection";
import type { ModelProviderEntry } from "../lib/dsh/providers";
import type { LauncherStatus } from "../lib/host/launcher";

/**
 * The dsh version the Host pins, read from `apps/host/supported-dsh.json` rather
 * than repeated: a version move must not touch a test literal.
 */
export const SUPPORTED_DSH: string = dshPin.version;

/** A dsh the Host refuses, for the mismatch paths. */
export const UNSUPPORTED_DSH = "0.2.2-rc.1";

/** The reason a Host reports when the installed dsh is not the pinned one. */
export function mismatchReason(actual: string): string {
  return `官方 dsh 版本不兼容：实际 ${actual}，需要 ${SUPPORTED_DSH}`;
}

/** One serialized Schemastery object schema, built by hand. */
export function schema(object: Record<string, object>): unknown {
  const refs: Record<string, object> = {};
  const dict: Record<string, number> = {};
  let uid = 100;
  const add = (node: object): number => {
    const id = uid++;
    refs[String(id)] = node;
    return id;
  };
  for (const [key, node] of Object.entries(object)) {
    if (node && "list" in node) {
      const list = (node as { list: object[] }).list;
      const ids = list.map((item) => add(item));
      dict[key] = add({ ...node, list: ids });
    } else {
      dict[key] = add(node);
    }
  }
  const root = add({ type: "object", dict });
  return { uid: root, refs };
}

function namespace(
  ns: string,
  schemaValue: unknown,
  value: Record<string, unknown>,
  revision = 0,
): SettingsNamespaceView {
  return {
    ns,
    autoGenerate: false,
    schema: schemaValue as never,
    value: value as never,
    user: {} as never,
    applies: "live",
    secrets: [],
    revision,
  };
}

export function providerDirectoryFixture(): ModelProviderEntry[] {
  return [
    {
      provider: "deepseek-account",
      displayName: "DeepSeek Account",
      settingsNs: "llm-deepseek-account",
      settingsPath: [],
      active: true,
    },
    {
      provider: "deepseek-official",
      displayName: "DeepSeek",
      settingsNs: "llm-deepseek",
      settingsPath: [],
      active: true,
      defaultBaseURL: "https://api.deepseek.com/anthropic",
    },
    {
      provider: "anthropic",
      displayName: "anthropic",
      settingsNs: "llm-pi-ai",
      settingsPath: ["providers", "anthropic"],
      active: false,
      defaultBaseURL: "https://api.anthropic.com",
      nativeAuth: { env: ["ANTHROPIC_API_KEY"], oauth: false },
    },
  ];
}

export function settingsFixture(): SettingsDescribeValue {
  const deepseek = schema({
    baseURL: { type: "string", meta: { description: "Messages 兼容端点" } },
    thinking: {
      type: "union",
      meta: { description: "部署的 thinking 策略" },
      list: [
        { type: "const", meta: { required: true }, value: "enabled" },
        { type: "const", meta: { required: true }, value: "disabled" },
      ],
    },
    maxTokens: { type: "number", meta: { default: 256000 } },
    apiKeyEnv: { type: "string", meta: { role: "credential-ref", default: "DEEPSEEK_API_KEY" } },
  });
  // A dict whose inner node is one provider profile, written by hand.
  const piSchema = {
    uid: 1,
    refs: {
      "1": { type: "object", dict: { providers: 2 } },
      "2": { type: "dict", inner: 3 },
      "3": { type: "object", dict: { apiKeyEnv: 4, baseURL: 5 } },
      "4": { type: "string", meta: { role: "credential-ref" } },
      "5": { type: "string" },
    },
  };
  const defaultSchema = schema({
    provider: { type: "string" },
    model: { type: "string" },
    reasoningEffort: { type: "string" },
  });
  return {
    writable: true,
    hasDocument: true,
    namespaces: [
      namespace("llm-deepseek", deepseek, {
        apiKeyEnv: "DEEPSEEK_API_KEY",
        maxTokens: 256000,
        thinking: "enabled",
      }),
      namespace("llm-pi-ai", piSchema, { providers: {} }),
      namespace("llm-deepseek-account", schema({}), {}),
      namespace("agent-default-model", defaultSchema, {
        provider: "deepseek-official",
        model: "deepseek-flash",
      }),
    ],
  };
}

export function modelCatalogFixture(): FlatModelCatalog {
  return {
    default: { provider: "deepseek-official", model: "deepseek-flash" },
    models: [
      {
        provider: "deepseek-official",
        providerName: "DeepSeek",
        model: "deepseek-flash",
        name: "DeepSeek-V4.1-Flash",
      },
      {
        provider: "deepseek-official",
        providerName: "DeepSeek",
        model: "deepseek-v4-pro",
        name: "DeepSeek-V4-Pro",
      },
    ],
    failures: [],
  };
}

export type SettingsFixture = {
  source: ProvidersSource;
  settings: SettingsDescribeValue;
  credentials: Record<string, CredentialInfo>;
  patches: { ns: string; patch: Record<string, unknown> }[];
  /** The API keys the fake store was asked to write, in order (never a UI read). */
  written: { ref: string; value: string }[];
};

/** A mutable fake of the Connection methods the providers page calls. */
export function createSettingsFixture(): SettingsFixture {
  const fixture: SettingsFixture = {
    settings: settingsFixture(),
    credentials: {
      DEEPSEEK_API_KEY: { configured: false, writable: true },
      ANTHROPIC_API_KEY: { configured: false, writable: true },
    },
    patches: [],
    written: [],
    source: {
      listProviders: async () => providerDirectoryFixture(),
      describeSettings: async () => clone(fixture.settings),
      describeCredentials: async (refs) =>
        Object.fromEntries(
          refs.map((ref) => [ref, { ...fixture.credentials[ref] }]).filter(([, v]) => v),
        ),
      updateSettings: async (ns, patch, revision) => {
        const target = fixture.settings.namespaces.find((view) => view.ns === ns);
        if (!target) throw new Error(`settings/rejected: no namespace ${ns}`);
        if (revision !== undefined && revision !== target.revision) {
          throw new Error("settings/conflict: stale revision");
        }
        fixture.patches.push({ ns, patch });
        target.value = merge(target.value, patch) as never;
        target.user = merge(target.user ?? {}, patch) as never;
        target.revision += 1;
        return clone(target);
      },
      setCredential: async (ref, value) => {
        fixture.written.push({ ref, value });
        fixture.credentials[ref] = { configured: true, writable: true };
      },
      unsetCredential: async (ref) => {
        fixture.credentials[ref] = { configured: false, writable: true };
      },
      modelCatalog: async () => modelCatalogFixture(),
    },
  };
  return fixture;
}

/** The Host facts a fake control API answers, with start / stop / restart. */
export function createHostFactsFixture(
  options: {
    dshVersion?: string | null;
    supported?: string;
    phase?: string;
    reason?: string;
  } = {},
): HostFactsSource & { phase: string } {
  let phase = options.phase ?? "ready";
  let dshVersion = options.dshVersion === undefined ? SUPPORTED_DSH : options.dshVersion;
  let reason = options.reason ?? null;
  const status = () => ({
    phase,
    generation: phase === "ready" ? "gen" : null,
    pid: phase === "ready" ? 4242 : null,
    version: options.supported ?? SUPPORTED_DSH,
    hostVersion: "0.1.0",
    dshVersion,
    reason,
    blocked: phase === "stopped",
    url: null,
  });
  const launcher: LauncherStatus = { phase: "running", port: 4882 };
  const fake = {
    get phase() {
      return phase;
    },
    status: async () => status() as never,
    start: async () => {
      phase = "ready";
      reason = null;
      return status() as never;
    },
    stop: async () => {
      phase = "stopped";
      reason = "后台已由用户停止";
      return status() as never;
    },
    restart: async () => {
      phase = "ready";
      reason = null;
      dshVersion = options.dshVersion === undefined ? SUPPORTED_DSH : options.dshVersion;
      return status() as never;
    },
    launcher: () => launcher,
  };
  return fake;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function merge(under: unknown, over: unknown): unknown {
  if (!isRecord(under) || !isRecord(over)) return over;
  const merged: Record<string, unknown> = { ...under };
  for (const [key, value] of Object.entries(over)) {
    merged[key] = key in merged ? merge(merged[key], value) : value;
  }
  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
