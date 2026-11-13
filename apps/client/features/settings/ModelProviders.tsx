/**
 * Settings › Model providers. The list is dsh's own directory (live routes
 * joined with declared ones); a row's card is its settings namespace as dsh
 * describes it, its key is the credentials Remote's, and the default model is
 * the namespace dsh stores. Nothing here hard-codes a provider or a field.
 */
import { effect, Scroll, signal, Text, untracked, View, type JSX } from "nsh";
import { Input } from "nsh/base";

import {
  Badge,
  Button,
  colors,
  finish,
  mono,
  Press,
  radius,
  Segmented,
  toneTint,
} from "../../components/ui";
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
  PROVIDERS_NEED_HOST,
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
        <Text style={{ fontSize: 20, fontWeight: "600", color: colors.text }}>模型供应商</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
          供应商与字段来自 dsh 的设置表单。API Key 只写入 dsh 的凭据存储。
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
              borderColor: colors.border,
              backgroundColor: colors.surface,
              ...finish.card,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
              {state().phase === "unavailable"
                ? PROVIDERS_NEED_HOST
                : "无法读取 dsh 的供应商设置。"}
            </Text>
            <Text
              testID="settings-providers-reason"
              style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}
            >
              {state().error ?? "Host 未连接。"}
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="重试" size="small" onPress={() => void loadProviders()} />
            </View>
          </View>
        </View>
      </If>
      <If when={state().phase === "loading"}>
        <Text style={{ paddingHorizontal: 20, fontSize: 13, color: colors.muted }}>
          正在读取 dsh 的供应商…
        </Text>
      </If>
      <If when={state().phase === "ready"}>
        <View style={{ flex: 1, minHeight: 0, flexDirection: "row" }}>
          <ProviderList selected={selected} />
          <View style={{ flex: 1, minWidth: 0, borderLeftWidth: 1, borderLeftColor: colors.line }}>
            <If
              when={active()}
              else={
                <Text style={{ padding: 20, fontSize: 13, color: colors.muted }}>
                  选择一个供应商。
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
      <GroupLabel label="已启用" />
      <Each of={live()}>
        {(row) => (
          <ProviderName
            row={row()}
            selected={props.selected() === row().entry.provider}
            onPress={() => props.selected.set(row().entry.provider)}
          />
        )}
      </Each>
      <GroupLabel label="可配置（未启用）" note={`${dormant().length}`} />
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
      <Text style={{ flex: 1, fontSize: 11, fontWeight: "600", color: colors.faint }}>
        {props.label}
      </Text>
      <If when={props.note}>
        <Text style={{ fontSize: 11, color: colors.faint }}>{props.note}</Text>
      </If>
    </View>
  );
}

function ProviderName(props: { row: ProviderRow; selected: boolean; onPress: () => void }) {
  const label = () => (props.row.account ? "账号" : credentialLabel(props.row.credential));
  const tone = () => {
    if (props.row.account) return colors.muted;
    return props.row.credential?.configured ? colors.up : colors.faint;
  };
  return (
    <Press
      onPress={props.onPress}
      scale={0.99}
      accessibilityLabel={`供应商 ${props.row.entry.displayName}`}
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
          backgroundColor: props.row.entry.active ? colors.up : colors.faint,
        }}
      />
      <View style={{ flex: 1, gap: 1 }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: props.selected ? "600" : "400",
            color: colors.text,
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
          localError.set(`${field} 需要一个数字。`);
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
          <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: colors.text }}>
            {props.row.entry.displayName}
          </Text>
          <Badge
            label={props.row.entry.active ? "已启用" : "未启用"}
            tone={props.row.entry.active ? "up" : "neutral"}
          />
        </View>
        <Text style={{ fontSize: 12, color: colors.faint, fontFamily: mono }}>
          {props.row.entry.provider}
        </Text>
        <If when={props.row.entry.error}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}>
            {props.row.entry.error}
          </Text>
        </If>
      </View>

      <If
        when={props.row.account}
        else={
          <Card title="API Key">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>状态</Text>
              <Badge
                label={credentialLabel(props.row.credential)}
                tone={props.row.credential?.configured ? "up" : "neutral"}
              />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
                新的 API Key
              </Text>
              <Input
                testID="settings-provider-key"
                accessibilityLabel={`${props.row.entry.displayName} 的 API Key`}
                masked
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                value={key()}
                placeholder={props.row.credential?.configured ? "已保存；输入新的值可替换" : "sk-…"}
                onChange={(event) => key.set(event.value)}
                style={{
                  height: 40,
                  fontSize: 14,
                  color: colors.text,
                  backgroundColor: colors.field,
                  borderWidth: 1,
                  borderColor: colors.fieldBorder,
                  borderRadius: radius.control,
                  borderCurve: "continuous",
                  paddingHorizontal: 12,
                  placeholderColor: colors.faint,
                }}
              />
              <Text style={{ fontSize: 11, lineHeight: 16, color: colors.faint }}>
                {`引用 ${props.row.keyRef}；Key 只写入 dsh 的凭据存储，不写入 MyAid 的任何文件。`}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  label="保存 Key"
                  variant="accent"
                  size="small"
                  disabled={!canWriteKey() || busy() || !key().trim()}
                  onPress={() => {
                    void saveProviderKey(props.row.entry.provider, key()).then((saved) => {
                      if (saved) key.set("");
                    });
                  }}
                />
                <Button
                  label="清除 Key"
                  size="small"
                  disabled={!canWriteKey() || busy() || !props.row.credential?.configured}
                  onPress={() => void clearProviderKey(props.row.entry.provider)}
                />
              </View>
            </View>
          </Card>
        }
      >
        <Card title="账号">
          <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>
            DeepSeek Account 在 dsh 里用账号登录，没有可在此填写的 API Key。
          </Text>
        </Card>
      </If>

      <Card title="供应商字段">
        <If
          when={base()}
          else={
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.faint }}>
              这个供应商的设置表单没有 base URL 字段。
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
            accessibilityLabel={advanced() ? "收起高级设置" : "展开高级设置"}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
              {advanced() ? "收起高级设置" : `高级设置（${others().length}）`}
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
            <Text style={{ flex: 1, fontSize: 12, color: colors.danger }}>{localError()}</Text>
          </If>
          <If when={!localError()}>
            <View style={{ flex: 1 }} />
          </If>
          <Button
            label="保存字段"
            size="small"
            disabled={
              !canWriteSettings() || busy() || !Object.values(dirty()).some((isDirty) => isDirty)
            }
            onPress={() => void saveFields()}
          />
        </View>
        <If when={!state().writable}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.warn }}>
            dsh 的设置文档是只读的；字段与 Key 都不能写入。
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
    return `dsh 默认（或 ${row.entry.baseURLEnv.join(" / ")}）`;
  }
  return "dsh 默认";
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
        <Text style={{ flex: 1, fontSize: 12, color: colors.muted }}>{props.field.key}</Text>
        <Segmented
          size="small"
          options={[
            { value: "false", label: "关" },
            { value: "true", label: "开" },
          ]}
          value={props.value === true ? "true" : "false"}
          onChange={(value) => props.onChange(value === "true")}
        />
      </View>
    );
  }
  if (props.field.kind === "choice" && props.field.choices) {
    return (
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
          {props.field.key}
        </Text>
        <Segmented
          size="small"
          options={props.field.choices}
          value={String(props.value)}
          onChange={(value) => props.onChange(value)}
        />
        <If when={props.field.description}>
          <Text style={{ fontSize: 11, lineHeight: 16, color: colors.faint }}>
            {props.field.description}
          </Text>
        </If>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>
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
          color: colors.text,
          backgroundColor: colors.field,
          borderWidth: 1,
          borderColor: colors.fieldBorder,
          borderRadius: radius.control,
          borderCurve: "continuous",
          paddingHorizontal: 10,
          placeholderColor: colors.faint,
        }}
      />
      <If when={props.field.description}>
        <Text style={{ fontSize: 11, lineHeight: 16, color: colors.faint }}>
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
    <Card title="默认模型">
      <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
        {current() ? `当前：${current()!.provider} / ${current()!.model}` : "dsh 未报告默认模型。"}
      </Text>
      <If
        when={options().length > 0}
        else={
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.faint }}>
            还没有可选的模型；配置供应商密钥后，dsh 会公布它的目录。
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
                  accessibilityLabel={`默认模型 ${option().provider} ${option().name}`}
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
                      backgroundColor: chosen() ? colors.accentFill : colors.faint,
                    }}
                  />
                  <Text style={{ flex: 1, fontSize: 13, color: colors.text }}>{option().name}</Text>
                  <Text style={{ fontSize: 11, color: colors.faint }}>
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
        <Text testID="settings-providers-message" style={{ fontSize: 12, color: colors.up }}>
          {state().message}
        </Text>
      </If>
      <If when={state().actionError}>
        <Text testID="settings-providers-error" style={{ fontSize: 12, color: colors.danger }}>
          {state().actionError}
        </Text>
      </If>
    </>
  );
}

function Card(props: { title: string; children: JSX.Element }) {
  return (
    <View
      style={{
        gap: 10,
        padding: 14,
        borderRadius: radius.card,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        ...finish.card,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>{props.title}</Text>
      {props.children}
    </View>
  );
}
