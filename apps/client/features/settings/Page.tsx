import { effect, Text, View } from "nsh";

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
import type { WorkspaceModule } from "../../workspace/types";

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

function SettingsPage() {
  effect(() => {
    void loadProductBackgroundState();
  });

  const state = productBackgroundState;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <WorkspacePageHeader title="Settings" root />
      <View style={{ flex: 1, padding: 24, gap: 16 }}>
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
              <Button label="启用后台" variant="accent" onPress={() => void enableBackgroundFromState()} />
              <Button label="停止后台" onPress={() => void stopBackgroundFromState()} />
              <Button label="刷新" variant="ghost" onPress={() => void refreshProductBackgroundState()} />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

export const settingsModule: WorkspaceModule = {
  id: "settings",
  label: "Settings",
  shortLabel: "Set",
  icon: "system",
  Page: SettingsPage,
};
