import { cleanup, effect, platform, Text, untracked, View } from "nsh";

import { Button, colors, Field, Segmented } from "../../components/ui";
import { claimOwner } from "../bots/model";
import { registry } from "../bots/state";
import { openOwningBot } from "./navigate";
import {
  answerApproval,
  archiveSession,
  connectSession,
  hostConnection,
  hostStatus,
  modelCatalog,
  pendingApproval,
  refreshHostStatus,
  renameSession,
  sessionError,
  sessionReady,
} from "./session/runtime";
import { catalogModelKey, selectedId } from "./state";

/** Dialogue context: Host / Session status, approvals, and catalog. */
export function DialogueContext(_props: { selectedId: string | null }) {
  const native = platform.idiom === "desktop" && platform.os !== "web";

  // Auto-start backend + connect once when Dialogue opens.
  effect(() => {
    if (!native) return;
    void (async () => {
      await refreshHostStatus();
      try {
        await connectSession(untracked(selectedId) ?? undefined);
      } catch {
        // sessionError surfaces failure
      }
    })();
  });
  cleanup(() => {});

  const hostUp = () => hostConnection() === "up" && hostStatus() !== null;
  const phase = () => hostStatus()?.phase ?? "未连接";
  const catalog = () => modelCatalog();
  const catalogOptions = () => {
    const items = catalog()?.models ?? [];
    return items.slice(0, 12).map((m) => ({
      value: `${m.provider}/${m.model}`,
      label: m.name || m.model,
    }));
  };

  const owned = () => {
    const id = selectedId();
    return id ? claimOwner(registry(), id) : null;
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <View desktop={{ windowDrag: true }} style={{ gap: 4, paddingBottom: 4 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.muted, letterSpacing: 0.4 }}>
          SESSION
        </Text>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
          {owned()?.claim.title || (selectedId() ? "未命名任务" : "未选择会话")}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {owned()
            ? `${owned()?.bot.name}${owned()?.claim.archived ? " · 已归档" : ""}`
            : sessionReady()
              ? "选择一条已认领的会话"
              : "正在连接后台…"}
        </Text>
        <If when={owned()}>
          <Field
            label="任务名"
            value={owned()?.claim.title ?? ""}
            placeholder="未命名任务"
            onChange={(value) => {
              const id = selectedId();
              if (id) void renameSession(id, value);
            }}
          />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="所属 Bot"
              variant="secondary"
              size="small"
              onPress={() => {
                const botId = owned()?.bot.id;
                if (botId) openOwningBot(botId);
              }}
            />
            <If when={!owned()?.claim.archived}>
              <Button
                label="归档"
                variant="secondary"
                size="small"
                onPress={() => {
                  const id = selectedId();
                  if (id) void archiveSession(id);
                }}
              />
            </If>
          </View>
        </If>
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
