/**
 * Settings module: read official dsh `settings.describe` (credentials stay on Host).
 * UI prefs (theme/window) are not shown here — they are local Client state.
 */
import type { SettingsDescribeValue } from "@myaid/dsh-web-protocol/settings";
import { effect, Scroll, signal, Text, View } from "nsh";

import { Button, colors } from "../../components/ui";
import { WorkspacePageHeader } from "../../components/workspace/PageHeader";

const loading = signal(false);
const error = signal<string | null>(null);
const snapshot = signal<SettingsDescribeValue | null>(null);

async function reload(): Promise<void> {
  loading.set(true);
  error.set(null);
  try {
    const { describeSettings, ensureConnected } = await import("../../lib/dsh/session");
    await ensureConnected();
    snapshot.set(await describeSettings());
  } catch (err) {
    error.set(err instanceof Error ? err.message : String(err));
    snapshot.set(null);
  } finally {
    loading.set(false);
  }
}

export function SettingsPage() {
  effect(() => {
    void reload();
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WorkspacePageHeader title="Settings" />
      <Scroll style={{ flex: 1 }} contentStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted }}>
          模型端点与凭据由官方 dsh settings / credentials
          管理；密钥不会写入本机产品文件。界面主题等偏好仍在本地。
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="刷新" size="small" disabled={loading()} onPress={() => void reload()} />
        </View>
        <If when={error()}>
          <Text style={{ fontSize: 13, color: colors.danger }}>{error()}</Text>
        </If>
        <If when={loading() && !snapshot()}>
          <Text style={{ fontSize: 13, color: colors.muted }}>加载中…</Text>
        </If>
        <If when={snapshot()}>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            可写：{snapshot()!.writable ? "是" : "否"} · 配置文档：
            {snapshot()!.hasDocument ? "有" : "无"} · 命名空间 {snapshot()!.namespaces.length}
          </Text>
          <Each of={snapshot()!.namespaces}>
            {(ns) => (
              <View
                style={{
                  gap: 4,
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                  {ns().ns}
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  revision {ns().revision} · secrets {ns().secrets.filter((s) => s.set).length}/
                  {ns().secrets.length} 已配置
                </Text>
              </View>
            )}
          </Each>
        </If>
      </Scroll>
    </View>
  );
}
