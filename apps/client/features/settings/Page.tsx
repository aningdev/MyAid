/**
 * Settings module: product Background orchestration + official dsh `settings.describe`
 * (credentials stay on Host). UI prefs (theme/window) are local Client state.
 */
import type { SettingsDescribeValue } from "@myaid/dsh-web-protocol/settings";
import { effect, Scroll, signal, Text, View } from "nsh";

import { Button, colors } from "../../components/ui";
import { WorkspacePageHeader } from "../../components/workspace/PageHeader";
import {
  enableBackgroundFromState,
  loadProductBackgroundState,
  productBackgroundState,
  refreshProductBackgroundState,
  stopBackgroundFromState,
  type RegistrationPhase,
} from "../../lib/background";

function phaseLabel(phase: RegistrationPhase | undefined): string {
  if (!phase) return "—";
  switch (phase) {
    case "notRegistered":
      return "未登记";
    case "pendingApproval":
      return "待系统批准";
    case "registered":
      return "已登记";
    case "denied":
      return "已拒绝";
    case "failed":
      return "失败";
    default:
      return phase;
  }
}

function availabilityLabel(value: string | undefined): string {
  switch (value) {
    case "full":
      return "完全可用";
    case "degraded":
      return "降级可用";
    case "off":
      return "未启用";
    default:
      return value ?? "—";
  }
}

const loading = signal(false);
const describeError = signal<string | null>(null);
const snapshot = signal<SettingsDescribeValue | null>(null);

async function reloadDescribe(): Promise<void> {
  loading.set(true);
  describeError.set(null);
  try {
    const { describeSettings, ensureConnected } = await import("../../lib/dsh/session");
    await ensureConnected();
    snapshot.set(await describeSettings());
  } catch (err) {
    describeError.set(err instanceof Error ? err.message : String(err));
    snapshot.set(null);
  } finally {
    loading.set(false);
  }
}

export function SettingsPage() {
  effect(() => {
    void loadProductBackgroundState();
    void reloadDescribe();
  });

  const state = productBackgroundState;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WorkspacePageHeader title="Settings" root />
      <Scroll style={{ flex: 1 }} contentStyle={{ padding: 16, gap: 16 }}>
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>产品后台</Text>
          {!state().runnable ? (
            <Text style={{ fontSize: 14, color: colors.muted }}>
              移动端不运行 Background Service；桌面端可在此编排 Host 与 Relay。
            </Text>
          ) : (
            <>
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 14, color: colors.text }}>
                  整体：{availabilityLabel(state().view?.availability)}
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted }}>
                  Host：{phaseLabel(state().view?.host.phase)}
                </Text>
                <Text style={{ fontSize: 14, color: colors.muted }}>
                  Relay：{phaseLabel(state().view?.relay.phase)}
                </Text>
                {state().error ? (
                  <Text style={{ fontSize: 13, color: colors.danger }}>{state().error}</Text>
                ) : null}
                {state().view?.enableErrors?.host ? (
                  <Text style={{ fontSize: 13, color: colors.warn }}>
                    Host 启用：{state().view?.enableErrors?.host}
                  </Text>
                ) : null}
                {state().view?.enableErrors?.relay ? (
                  <Text style={{ fontSize: 13, color: colors.warn }}>
                    Relay 启用：{state().view?.enableErrors?.relay}
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Button
                  label="启用后台"
                  variant="accent"
                  onPress={() => void enableBackgroundFromState()}
                />
                <Button label="停止后台" onPress={() => void stopBackgroundFromState()} />
                <Button
                  label="刷新"
                  variant="ghost"
                  onPress={() => void refreshProductBackgroundState()}
                />
              </View>
            </>
          )}
        </View>

        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>模型与凭据</Text>
          <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted }}>
            模型端点与凭据由官方 dsh settings / credentials
            管理；密钥不会写入本机产品文件。界面主题等偏好仍在本地。
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="刷新"
              size="small"
              disabled={loading()}
              onPress={() => void reloadDescribe()}
            />
          </View>
          <If when={describeError()}>
            <Text style={{ fontSize: 13, color: colors.danger }}>{describeError()}</Text>
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
        </View>
      </Scroll>
    </View>
  );
}
