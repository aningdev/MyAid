import type {
  CredentialInfo,
  SettingsDescribeValue,
  SettingsNamespaceView,
} from "@dsh-bot/dsh-web-protocol/settings";

import type { FlatCatalogModel } from "../../lib/dsh/connection";
import type { ModelProviderEntry } from "../../lib/dsh/providers";
/**
 * The pure half of Settings › Model providers: read dsh's own description of a
 * provider (its settings namespace, its profile, its field schema) instead of
 * hard-coding fields or a provider list. Everything here is a function of a
 * settings snapshot and the directory row, so the tests can pin the shapes
 * without a Host.
 */
import { t } from "../../lib/i18n";

/** One serialized Schemastery node (`{ uid, refs }`), or a node inside `refs`. */
type SerializedSchema = {
  uid?: number;
  refs?: Record<string, unknown>;
  type?: string;
  dict?: Record<string, unknown>;
  inner?: unknown;
  list?: unknown[];
  value?: unknown;
  meta?: {
    description?: string | Record<string, string>;
    default?: unknown;
    role?: string;
  };
};

/** One editable provider field, derived from the schema dsh sent. */
export type ProviderField = {
  /** From the namespace root: the settings path plus the field key. */
  path: string[];
  key: string;
  label: string;
  description?: string;
  kind: "string" | "number" | "boolean" | "choice";
  value: string | number | boolean;
  choices?: { value: string; label: string }[];
};

/** The settings namespace one provider row edits, when it has one. */
export function providerNamespace(
  snapshot: SettingsDescribeValue | null,
  entry: ModelProviderEntry,
): SettingsNamespaceView | undefined {
  if (!snapshot || !entry.settingsNs) return undefined;
  return snapshot.namespaces.find((view) => view.ns === entry.settingsNs);
}

/** The profile object dsh resolves for one provider, or undefined while dormant. */
export function providerProfile(
  snapshot: SettingsDescribeValue | null,
  entry: ModelProviderEntry,
): Record<string, unknown> | undefined {
  const view = providerNamespace(snapshot, entry);
  if (!view) return undefined;
  const profile = valueAt(view.value, entry.settingsPath);
  return isRecord(profile) ? profile : undefined;
}

/** The credential reference the profile names, when it names one. */
export function namedKeyRef(profile: Record<string, unknown> | undefined): string | undefined {
  const ref = profile?.apiKeyEnv;
  return typeof ref === "string" && ref.trim() ? ref.trim() : undefined;
}

/** The conventional reference for a route that names none (dsh's own derivation). */
export function derivedKeyRef(provider: string): string {
  return `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

/** The reference a provider's key lives under: the profile's, else the derived one. */
export function providerKeyRef(
  entry: ModelProviderEntry,
  profile: Record<string, unknown> | undefined,
): string {
  return namedKeyRef(profile) ?? derivedKeyRef(entry.provider);
}

/** How a provider's key reads on the page. */
export function credentialLabel(credential: CredentialInfo | undefined): string {
  if (!credential) return t("providers.credentialChecked");
  return credential.configured
    ? t("providers.credentialConfigured")
    : t("providers.credentialMissing");
}

/** A key may be written only while the store is writable and the credential is not read-only. */
export function keyWritable(
  credential: CredentialInfo | undefined,
  settingsWritable: boolean,
): boolean {
  if (!settingsWritable) return false;
  return credential === undefined || credential.writable;
}

/**
 * The editable fields under a provider's profile: the scalar and enum fields
 * its schema declares, with their effective values. Complex fields (model
 * lists, headers, objects) and secret slots stay out of this small form; the
 * API key has its own row and is written through the credentials Remote.
 */
export function providerFields(
  snapshot: SettingsDescribeValue | null,
  entry: ModelProviderEntry,
): ProviderField[] {
  const view = providerNamespace(snapshot, entry);
  if (!view) return [];
  const schema = schemaNodeAt(view.schema, entry.settingsPath);
  if (!schema || schema.type !== "object" || !schema.dict) return [];
  const refs = (view.schema as SerializedSchema).refs ?? {};
  const fields: ProviderField[] = [];
  for (const [key, raw] of Object.entries(schema.dict)) {
    const node = resolveNode(refs, raw);
    if (!node) continue;
    const role = node.meta?.role;
    if (role === "credential-ref" || role === "secret") continue;
    const path = [...entry.settingsPath, key];
    const effective = valueAt(view.value, path) ?? node.meta?.default;
    const description =
      typeof node.meta?.description === "string" ? node.meta.description : undefined;
    const base = {
      path,
      key,
      label: description ? `${key}` : key,
      ...(description ? { description } : {}),
    };
    if (node.type === "string") {
      fields.push({
        ...base,
        kind: "string",
        value: typeof effective === "string" ? effective : "",
      });
      continue;
    }
    if (node.type === "number") {
      fields.push({
        ...base,
        kind: "number",
        value: typeof effective === "number" && Number.isFinite(effective) ? effective : 0,
      });
      continue;
    }
    if (node.type === "boolean") {
      fields.push({ ...base, kind: "boolean", value: effective === true });
      continue;
    }
    if (node.type === "union") {
      const choices = (node.list ?? [])
        .map((item) => resolveNode(refs, item))
        .filter((item): item is SerializedSchema => item?.type === "const")
        .map((item) => ({ value: String(item.value), label: String(item.value) }));
      if (choices.length === 0) continue;
      fields.push({
        ...base,
        kind: "choice",
        value: typeof effective === "string" ? effective : (choices[0]?.value ?? ""),
        choices,
      });
    }
  }
  return fields;
}

/** The patch `settings.update` takes for values under a provider's settings path. */
export function nestedPatch(
  path: readonly string[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  let patch: Record<string, unknown> = values;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    patch = { [path[index]!]: patch };
  }
  return patch;
}

/**
 * Which namespace holds the default model: the `agent-default-model` entry
 * when present, else any namespace whose schema declares `provider` and
 * `model` strings. No entry id is assumed if the profile names its own.
 */
export function defaultModelNamespace(
  snapshot: SettingsDescribeValue | null,
): SettingsNamespaceView | undefined {
  if (!snapshot) return undefined;
  const named = snapshot.namespaces.find((view) => view.ns === "agent-default-model");
  if (named) return named;
  return snapshot.namespaces.find((view) => {
    const schema = schemaNodeAt(view.schema, []);
    if (!schema?.dict) return false;
    const hasProvider = "provider" in schema.dict;
    const hasModel = "model" in schema.dict;
    const value = valueAt(view.value, []);
    return (
      hasProvider &&
      hasModel &&
      isRecord(value) &&
      typeof value.provider === "string" &&
      typeof value.model === "string"
    );
  });
}

/** The default selection as dsh stores it. */
export function defaultModelOf(
  view: SettingsNamespaceView | undefined,
): { provider: string; model: string } | null {
  const value = view ? valueAt(view.value, []) : undefined;
  if (!isRecord(value)) return null;
  return typeof value.provider === "string" && typeof value.model === "string"
    ? { provider: value.provider, model: value.model }
    : null;
}

/** One model choice for the default-model card. */
export type DefaultModelOption = {
  provider: string;
  providerName: string;
  model: string;
  name: string;
};

/**
 * The models a person can pick as the default. dsh's Session catalog is the
 * authority when it has models (credential-gated); without one, each provider
 * namespace's declared `models` list is what dsh itself advertises, and the
 * current default is always offered. The result is de-duplicated by route.
 */
export function defaultModelOptions(
  catalog: readonly FlatCatalogModel[] | null,
  snapshot: SettingsDescribeValue | null,
  entries: readonly ModelProviderEntry[],
  current: { provider: string; model: string } | null,
): DefaultModelOption[] {
  const options = new Map<string, DefaultModelOption>();
  const add = (option: DefaultModelOption) => {
    const key = `${option.provider}/${option.model}`;
    if (!options.has(key)) options.set(key, option);
  };
  for (const model of catalog ?? []) {
    add({
      provider: model.provider,
      providerName: model.providerName,
      model: model.model,
      name: model.name || model.model,
    });
  }
  for (const view of snapshot?.namespaces ?? []) {
    const providers = entries.filter((entry) => entry.settingsNs === view.ns);
    for (const group of declaredModelGroups(view.value, providers)) {
      if (providers.length === 0) {
        add(group);
        continue;
      }
      for (const provider of providers) {
        add({ ...group, provider: provider.provider, providerName: provider.displayName });
      }
    }
  }
  if (current) {
    add({
      provider: current.provider,
      providerName: current.provider,
      model: current.model,
      name: current.model,
    });
  }
  return [...options.values()].sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name),
  );
}

/**
 * The `models` arrays an adapter's settings value carries at its top level
 * (`{ models: [{ id, name }] }`), each routed under that namespace's provider.
 */
function declaredModelGroups(
  value: unknown,
  providers: readonly ModelProviderEntry[],
): DefaultModelOption[] {
  if (!isRecord(value) || !Array.isArray(value.models)) return [];
  const groups: DefaultModelOption[] = [];
  for (const entry of value.models) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id) continue;
    groups.push({
      provider: providers[0]?.provider ?? "",
      providerName: providers[0]?.displayName ?? "",
      model: entry.id,
      name: typeof entry.name === "string" && entry.name ? entry.name : entry.id,
    });
  }
  return groups;
}

// --- JSON and schema helpers ----------------------------------------------

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function valueAt(value: unknown, path: readonly string[]): unknown {
  let node: unknown = value;
  for (const key of path) {
    if (!isRecord(node) || !(key in node)) return undefined;
    node = node[key];
  }
  return node;
}

/** The schema node at `path` from a serialized `schema.toJSON()` envelope. */
export function schemaNodeAt(
  serialized: unknown,
  path: readonly string[],
): SerializedSchema | undefined {
  const root = schemaRoot(serialized);
  if (!root) return undefined;
  const refs = root.refs ?? {};
  let node = resolveNode(refs, root.uid);
  for (const key of path) {
    if (!node) return undefined;
    let next: unknown;
    if (node.type === "object") next = node.dict?.[key];
    else if (node.type === "dict") next = node.inner;
    else return undefined;
    node = resolveNode(refs, next);
  }
  return node;
}

function schemaRoot(serialized: unknown): SerializedSchema | undefined {
  return isRecord(serialized) && isRecord(serialized.refs)
    ? (serialized as SerializedSchema)
    : undefined;
}

function resolveNode(refs: Record<string, unknown>, node: unknown): SerializedSchema | undefined {
  if (typeof node === "number") {
    const target = refs[String(node)];
    return isRecord(target) ? (target as SerializedSchema) : undefined;
  }
  if (typeof node === "string") {
    const target = refs[node];
    return isRecord(target) ? (target as SerializedSchema) : undefined;
  }
  return isRecord(node) ? (node as SerializedSchema) : undefined;
}
