/**
 * Settings › Model providers. The list is dsh's own directory (live routes
 * joined with declared ones); a row's card is its settings namespace as dsh
 * describes it, its key is the credentials Remote's, and the default model is
 * the namespace dsh stores. Nothing here hard-codes a provider or a field.
 */
import { effect, Scroll, signal, Text, untracked, View, type JSX, token } from "nsh";

import { OptionSegmented, Press } from "../../components/app";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card as CardFrame, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Field, FieldLabel } from "../../components/ui/field";
import { Input } from "../../components/ui/input";
import { t } from "../../lib/i18n";
import { finish, mono, radius, toneTint } from "../../lib/theme";
import type { ProviderField } from "./providerModel";
import {
  credentialLabel,
  defaultModelOptions,
  keyWritable,
  providerNamespace,
} from "./providerModel";
import {
  clearProviderKey,
  currentDefault,
  fieldsOf,
  loadProviders,
  providersNeedHost,
  providersState,
  saveDefaultModel,
  saveProviderFields,
  saveProviderKey,
  type ProviderRow,
} from "./providers";

export function ProvidersSection() {
  effect(() => {
    void loadProviders();
  });
  const state = providersState;
  const selected = signal<string | null>(null);

  // Open on the official DeepSeek route, else the first live one.
  effect(() => {
    const rows = state().rows;
    if (rows.length === 0) return;
    if (rows.some((row) => row.entry.provider === selected())) return;
    const preferred =
      rows.find((row) => row.entry.provider === "deepseek-official") ??
      rows.find((row) => row.entry.active) ??
      rows[0];
    if (preferred) selected.set(preferred.entry.provider);
  });

  const active = (): ProviderRow | undefined =>
    state().rows.find((row) => row.entry.provider === selected());

  return (
    <View testID="settings-providers" style={{ flex: 1, minHeight: 0 }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, gap: 4 }}>
        <Text style={{ fontSize: 20, fontWeight: "600", color: token("foreground") }}>
          {t("providers.title")}
        </Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
          {t("providers.note")}
        </Text>
      </View>
      <If when={state().phase === "unavailable" || state().phase === "error"}>
        <View style={{ paddingHorizontal: 20, paddingBottom: 16, maxWidth: 640, gap: 6 }}>
          <View
            style={{
              gap: 6,
              padding: 14,
              borderRadius: radius.card,
              borderWidth: 1,
              borderColor: token("border"),
              backgroundColor: token("card"),
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: token("foreground") }}>
              {state().phase === "unavailable" ? providersNeedHost() : t("providers.unreadable")}
            </Text>
            <Text
              testID="settings-providers-reason"
              style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}
            >
              {state().error ?? t("providers.hostDown")}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button size="sm" variant="secondary" onPress={() => void loadProviders()}>
                {t("common.retry")}
              </Button>
            </View>
          </View>
        </View>
      </If>
      <If when={state().phase === "loading"}>
        <Text style={{ paddingHorizontal: 20, fontSize: 13, color: token("muted-foreground") }}>
          {t("providers.loading")}
        </Text>
      </If>
      <If when={state().phase === "ready"}>
        <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
          <ProviderList selected={selected} />
          <View
            style={{ flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: token("line") }}
          >
            <If
              when={active()}
              else={
                <Text style={{ padding: 20, fontSize: 13, color: token("muted-foreground") }}>
                  {t("providers.pick")}
                </Text>
              }
            >
              {(row) => <ProviderEditor row={row()} />}
            </If>
          </View>
        </View>
      </If>
    </View>
  );
}

function ProviderList(props: { selected: ReturnType<typeof signal<string | null>> }) {
  const state = providersState;
  const live = () => state().rows.filter((row) => row.entry.active);
  const dormant = () => state().rows.filter((row) => !row.entry.active);
  return (
    <Scroll style={{ width: 248, flexShrink: 0 }} contentStyle={{ padding: 10, gap: 2 }}>
      <GroupLabel label={t("providers.enabledGroup")} />
      <Each of={live()}>
        {(row) => (
          <ProviderName
            row={row()}
            selected={props.selected() === row().entry.provider}
            onPress={() => props.selected.set(row().entry.provider)}
          />
        )}
      </Each>
      <GroupLabel label={t("providers.dormantGroup")} note={`${dormant().length}`} />
      <Each of={dormant()}>
        {(row) => (
          <ProviderName
            row={row()}
            selected={props.selected() === row().entry.provider}
            onPress={() => props.selected.set(row().entry.provider)}
          />
        )}
      </Each>
    </Scroll>
  );
}

function GroupLabel(props: { label: string; note?: string }) {
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 8, paddingTop: 10, paddingBottom: 4 }}>
      <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: token("faint") }}>
        {props.label}
      </Text>
      <If when={props.note}>
        <Text style={{ fontSize: 11, color: token("faint") }}>{props.note}</Text>
      </If>
    </View>
  );
}

function ProviderName(props: { row: ProviderRow; selected: boolean; onPress: () => void }) {
  const label = () =>
    props.row.account ? t("providers.account") : credentialLabel(props.row.credential);
  const tone = () => {
    if (props.row.account) return token("muted-foreground");
    return props.row.credential?.configured ? token("up") : token("faint");
  };
  return (
    <Press
      onPress={props.onPress}
      scale={0.99}
      accessibilityLabel={t("providers.rowLabel", { name: props.row.entry.displayName })}
      accessibilityState={{ selected: props.selected }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: 38,
        paddingHorizontal: 8,
        borderRadius: radius.control,
        backgroundColor: props.selected ? toneTint("accent") : "transparent",
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: props.row.entry.active ? token("up") : token("faint"),
        }}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: props.selected ? "600" : "400",
            color: token("foreground"),
            numberOfLines: 1,
          }}
        >
          {props.row.entry.displayName}
        </Text>
        <Text style={{ fontSize: 11, color: tone(), numberOfLines: 1 }}>{label()}</Text>
      </View>
    </Press>
  );
}

function ProviderEditor(props: { row: ProviderRow }) {
  const state = providersState;
  const key = signal("");
  const fields = signal<ProviderField[]>([]);
  const drafts = signal<Record<string, string | boolean>>({});
  const dirty = signal<Record<string, boolean>>({});
  const advanced = signal(false);
  const localError = signal<string | null>(null);

  // Seed the form from dsh's effective values; a saved revision re-seeds it,
  // a status line changing does not.
  const version = () => {
    const ns = providerNamespace(state().settings, props.row.entry);
    return `${props.row.entry.provider}#${ns?.revision ?? -1}`;
  };
  effect(() => {
    version();
    untracked(() => {
      const next = fieldsOf(props.row);
      fields.set(next);
      const seed: Record<string, string | boolean> = {};
      for (const field of next) {
        seed[field.key] =
          field.kind === "number" ? String(field.value) : (field.value as string | boolean);
      }
      drafts.set(seed);
      dirty.set({});
      localError.set(null);
      advanced.set(false);
    });
  });

  const namespace = () => providerNamespace(state().settings, props.row.entry);
  const base = () => fields().find((field) => field.key === "baseURL");
  const others = () => fields().filter((field) => field.key !== "baseURL");
  const busy = () => state().busy === props.row.entry.provider;
  const canWriteKey = () => keyWritable(props.row.credential, state().writable);
  const canWriteSettings = () => state().writable && namespace() !== undefined;

  const saveFields = async (): Promise<void> => {
    const changed = Object.entries(dirty()).filter(([, isDirty]) => isDirty);
    if (changed.length === 0) return;
    const values: Record<string, unknown> = {};
    for (const [field] of changed) {
      const def = fields().find((item) => item.key === field);
      if (!def) continue;
      if (def.kind === "number") {
        const parsed = Number(drafts()[field]);
        if (!Number.isFinite(parsed)) {
          localError.set(t("providers.numberField", { field }));
          return;
        }
        values[field] = parsed;
        continue;
      }
      values[field] = drafts()[field];
    }
    localError.set(null);
    await saveProviderFields(props.row.entry.provider, values);
  };

  return (
    <Scroll style={{ flex: 1 }} contentStyle={{ padding: 20, gap: 16, maxWidth: 680 }}>
      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: token("foreground") }}>
            {props.row.entry.displayName}
          </Text>
          <Badge tone={props.row.entry.active ? "up" : "neutral"}>
            {props.row.entry.active ? t("providers.enabled") : t("providers.notEnabled")}
          </Badge>
        </View>
        <Text style={{ fontSize: 12, color: token("faint"), fontFamily: mono }}>
          {props.row.entry.provider}
        </Text>
        <If when={props.row.entry.error}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}>
            {props.row.entry.error}
          </Text>
        </If>
      </View>

      <If
        when={props.row.account}
        else={
          <Card title="API Key">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, color: token("muted-foreground") }}>
                {t("providers.state")}
              </Text>
              <Badge tone={props.row.credential?.configured ? "up" : "neutral"}>
                {credentialLabel(props.row.credential)}
              </Badge>
            </View>
            <View style={{ gap: 6 }}>
              <Field>
                <FieldLabel>{t("providers.apiKey")}</FieldLabel>
                <Input
                  testID="settings-provider-key"
                  accessibilityLabel={t("providers.apiKeyLabel", {
                    name: props.row.entry.displayName,
                  })}
                  masked
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  value={key()}
                  placeholder={
                    props.row.credential?.configured ? t("providers.apiKeyReplace") : "sk-…"
                  }
                  onChange={(event) => key.set(event.value)}
                />
              </Field>
              <Text style={{ fontSize: 11, lineHeight: 16, color: token("faint") }}>
                {t("providers.keyRef", { ref: props.row.keyRef })}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  size="sm"
                  disabled={!canWriteKey() || busy() || !key().trim()}
                  onPress={() => {
                    void saveProviderKey(props.row.entry.provider, key()).then((saved) => {
                      if (saved) key.set("");
                    });
                  }}
                >
                  {t("providers.saveKey")}
                </Button>
                <Button
                  size="sm"
                  disabled={!canWriteKey() || busy() || !props.row.credential?.configured}
                  variant="secondary"
                  onPress={() => void clearProviderKey(props.row.entry.provider)}
                >
                  {t("providers.clearKey")}
                </Button>
              </View>
            </View>
          </Card>
        }
      >
        <Card title={t("providers.accountCard")}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: token("muted-foreground") }}>
            {t("providers.accountNote")}
          </Text>
        </Card>
      </If>

      <Card title={t("providers.fieldsCard")}>
        <If
          when={base()}
          else={
            <Text style={{ fontSize: 12, lineHeight: 18, color: token("faint") }}>
              {t("providers.noBaseUrl")}
            </Text>
          }
        >
          {(field) => (
            <ProviderFieldInput
              field={field()}
              value={String(drafts()[field().key] ?? "")}
              placeholder={endpointHint(props.row)}
              disabled={!canWriteSettings() || busy()}
              onChange={(value) => {
                drafts.update((current) => ({ ...current, [field().key]: value }));
                dirty.update((current) => ({ ...current, [field().key]: true }));
              }}
            />
          )}
        </If>
        <If when={others().length > 0}>
          <Press
            onPress={() => advanced.set(!advanced())}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 32 }}
            accessibilityLabel={
              advanced() ? t("providers.collapseAdvanced") : t("providers.expandAdvanced")
            }
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
              {advanced()
                ? t("providers.collapseAdvanced")
                : t("providers.expandAdvancedCount", { count: others().length })}
            </Text>
          </Press>
        </If>
        <If when={advanced()}>
          <View style={{ gap: 12 }}>
            <Each of={others()}>
              {(field) => (
                <ProviderFieldInput
                  field={field()}
                  value={
                    field().kind === "boolean"
                      ? drafts()[field().key] === true
                      : String(drafts()[field().key] ?? "")
                  }
                  disabled={!canWriteSettings() || busy()}
                  onChange={(value) => {
                    drafts.update((current) => ({ ...current, [field().key]: value }));
                    dirty.update((current) => ({ ...current, [field().key]: true }));
                  }}
                />
              )}
            </Each>
          </View>
        </If>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <If when={localError()}>
            <Text style={{ flex: 1, fontSize: 12, color: token("destructive") }}>
              {localError()}
            </Text>
          </If>
          <If when={!localError()}>
            <View style={{ flex: 1 }} />
          </If>
          <Button
            size="sm"
            disabled={
              !canWriteSettings() || busy() || !Object.values(dirty()).some((isDirty) => isDirty)
            }
            variant="secondary"
            onPress={() => void saveFields()}
          >
            {t("providers.saveFields")}
          </Button>
        </View>
        <If when={!state().writable}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: token("warn") }}>
            {t("providers.readOnly")}
          </Text>
        </If>
      </Card>

      <DefaultModelCard />
      <StatusLine />
    </Scroll>
  );
}

function endpointHint(row: ProviderRow): string {
  if (row.entry.defaultBaseURL) return row.entry.defaultBaseURL;
  if (row.entry.baseURLEnv && row.entry.baseURLEnv.length > 0) {
    return t("providers.baseDefault", { env: row.entry.baseURLEnv.join(" / ") });
  }
  return t("providers.baseDshDefault");
}

function ProviderFieldInput(props: {
  field: ProviderField;
  value: string | boolean;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
}) {
  if (props.field.kind === "boolean") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 12, color: token("muted-foreground") }}>
          {props.field.key}
        </Text>
        <OptionSegmented
          options={[
            { value: "false", label: t("common.off") },
            { value: "true", label: t("common.on") },
          ]}
          value={props.value === true ? "true" : "false"}
          onValueChange={(value) => props.onChange(value === "true")}
        />
      </View>
    );
  }
  if (props.field.kind === "choice" && props.field.choices) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
          {props.field.key}
        </Text>
        <OptionSegmented
          options={props.field.choices.map((choice) => ({
            value: choice.value,
            label: choice.label,
          }))}
          value={String(props.value)}
          onValueChange={(value) => props.onChange(value)}
          fill
        />
        <If when={props.field.description}>
          <Text style={{ fontSize: 11, lineHeight: 16, color: token("faint") }}>
            {props.field.description}
          </Text>
        </If>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: token("muted-foreground") }}>
        {props.field.key}
      </Text>
      <Input
        testID={`settings-provider-field-${props.field.key}`}
        accessibilityLabel={props.field.key}
        value={String(props.value)}
        placeholder={props.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        readonly={props.disabled}
        onChange={(event) => props.onChange(event.value)}
        style={{
          height: 38,
          fontSize: 13,
          color: token("foreground"),
          backgroundColor: token("field"),
          borderWidth: 1,
          borderColor: token("input"),
          borderRadius: radius.control,
          borderCurve: "continuous",
          paddingHorizontal: 10,
          placeholderColor: token("faint"),
        }}
      />
      <If when={props.field.description}>
        <Text style={{ fontSize: 11, lineHeight: 16, color: token("faint") }}>
          {props.field.description}
        </Text>
      </If>
    </View>
  );
}

function DefaultModelCard() {
  const state = providersState;
  const current = () => currentDefault();
  const options = () =>
    defaultModelOptions(
      state().catalog,
      state().settings,
      state().rows.map((row) => row.entry),
      current(),
    );
  const saving = () => state().busy === "default";
  return (
    <Card title={t("providers.defaultModel")}>
      <Text style={{ fontSize: 12, lineHeight: 18, color: token("muted-foreground") }}>
        {current()
          ? t("providers.currentModel", {
              provider: current()!.provider,
              model: current()!.model,
            })
          : t("providers.noDefaultModel")}
      </Text>
      <If
        when={options().length > 0}
        else={
          <Text style={{ fontSize: 12, lineHeight: 18, color: token("faint") }}>
            {t("providers.noModels")}
          </Text>
        }
      >
        <View style={{ gap: 1 }}>
          <Each of={options()}>
            {(option) => {
              const chosen = () =>
                current()?.provider === option().provider && current()?.model === option().model;
              return (
                <Press
                  onPress={() => void saveDefaultModel(option().provider, option().model)}
                  disabled={!state().writable || saving()}
                  accessibilityLabel={t("providers.defaultModelLabel", {
                    provider: option().provider,
                    name: option().name,
                  })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    minHeight: 34,
                    paddingHorizontal: 8,
                    borderRadius: radius.control,
                    backgroundColor: chosen() ? toneTint("accent") : "transparent",
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: chosen() ? token("brand-fill") : token("faint"),
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: 13, color: token("foreground") }}>
                    {option().name}
                  </Text>
                  <Text style={{ fontSize: 11, color: token("faint") }}>
                    {`${option().providerName} / ${option().model}`}
                  </Text>
                </Press>
              );
            }}
          </Each>
        </View>
      </If>
    </Card>
  );
}

function StatusLine() {
  const state = providersState;
  return (
    <>
      <If when={state().message}>
        <Text testID="settings-providers-message" style={{ fontSize: 12, color: token("up") }}>
          {state().message}
        </Text>
      </If>
      <If when={state().actionError}>
        <Text
          testID="settings-providers-error"
          style={{ fontSize: 12, color: token("destructive") }}
        >
          {state().actionError}
        </Text>
      </If>
    </>
  );
}

function Card(props: { title: string; children: JSX.Element }) {
  return (
    <CardFrame>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>{props.children}</CardContent>
    </CardFrame>
  );
}
