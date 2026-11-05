import { cleanup, effect, platform, Text, untracked, View } from "nsh";

import { Button, colors, Segmented } from "../../components/ui";
import {
  activeSessionId,
  answerApproval,
  connectSession,
  hostStatus,
  modelCatalog,
  pendingApproval,
  refreshHostStatus,
  sessionError,
  sessionReady,
} from "./session/runtime";
import { catalogModelKey, selectItem, selectedId } from "./state";

/** Dialogue context: Host / Session status, approvals, and catalog. */
export function DialogueContext(_props: { selectedId: string | null }) {
  const native = platform.idiom === "desktop" && platform.os !== "web";

  // Auto-start backend + connect once when Dialogue opens.
  effect(() => {
    if (!native) return;
    void (async () => {
      await refreshHostStatus();
      try {
        const current = untracked(selectedId);
        await connectSession(current ?? undefined);
        const active = untracked(activeSessionId);
        if (active && !untracked(selectedId)) selectItem(active);
      } catch {
        // sessionError surfaces failure
      }
    })();
  });
  cleanup(() => {});

  const hostUp = () => hostStatus() !== null;
  const phase = () => hostStatus()?.phase ?? "unavailable";
  const catalog = () => modelCatalog();
  const catalogOptions = () => {
    const items = catalog()?.models ?? [];
    return items.slice(0, 12).map((m) => ({
      value: `${m.provider}/${m.model}`,
      label: m.name || m.model,
    }));
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <View desktop={{ windowDrag: true }} style={{ gap: 4, paddingBottom: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: 0.4 }}>
          SESSION
        </Text>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
          {activeSessionId() ? activeSessionId() : "未连接"}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {sessionReady() ? "官方 Session 已连接" : "正在自动连接后台…"}
        </Text>
      </View>

      <If when={native}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: 0.4 }}>
          BACKEND
        </Text>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, color: colors.text }}>
            {sessionReady() ? "Session connected" : hostUp() ? `Host: ${phase()}` : "宿主未运行"}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.faint }}>
            {sessionReady()
              ? "后台已自动启动并连接。"
              : hostUp()
                ? hostStatus()?.reason || "正在启动 / 连接…"
                : "请用仓库根目录 bun run dev（自动起 Host）"}
          </Text>

          <If when={sessionError()}>
            <Text style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}>
              {sessionError()}
            </Text>
            <Button
              label="重试连接"
              variant="secondary"
              onPress={() => {
                void connectSession(selectedId() ?? undefined).catch(() => undefined);
              }}
            />
          </If>
        </View>

        <If when={pendingApproval()}>
          <View
            style={{
              gap: 8,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.raised,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
              需要审批：{pendingApproval()?.toolName}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>{pendingApproval()?.reason}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="允许一次" onPress={() => answerApproval("allowed-once")} />
              <Button label="拒绝" variant="secondary" onPress={() => answerApproval("rejected")} />
            </View>
          </View>
        </If>

        <If when={catalogOptions().length > 0}>
          <Text
            style={{ fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: 0.4 }}
          >
            MODEL
          </Text>
          <Segmented
            size="small"
            options={catalogOptions()}
            value={catalogModelKey() ?? catalogOptions()[0]?.value}
            onChange={(v) => catalogModelKey.set(v)}
          />
        </If>
      </If>

      <If when={!native}>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.faint }}>
          Dialogue 需要桌面 Client 连接本地 Host / dsh。
        </Text>
      </If>
    </View>
  );
}
