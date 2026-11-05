import { effect, Text, View } from "nsh";

import { alpha, Button, colors, finish, hovered, Icon, Press, radius } from "../../components/ui";
import { registry } from "../bots/state";
import { openMain } from "./nav";
import { openBotSessions, openModule, openOwningBot } from "./navigate";
import {
  activeSessionId,
  approvalLock,
  createSession,
  creatingSession,
  pendingApproval,
  refreshSessionList,
  releaseMissingSession,
  sessionError,
  sessionList,
} from "./session/runtime";
import { bumpChatEpoch, selectItem, selectedId, sessionScopeBotId } from "./state";

/** Dialogue list: official Sessions + new Session. */
export function DialogueList() {
  effect(() => {
    registry();
    sessionScopeBotId();
    void refreshSessionList();
  });

  const rows = () => sessionList();
  const scopedBot = () => registry().bots.find((bot) => bot.id === sessionScopeBotId()) ?? null;
  const canCreate = () =>
    scopedBot()?.status === "ready" && !pendingApproval() && !creatingSession();

  const onNew = () => {
    const botId = scopedBot()?.id;
    if (!botId || creatingSession()) return;
    void (async () => {
      try {
        const id = await createSession(botId);
        selectItem(id);
        bumpChatEpoch();
        openMain(id);
      } catch {
        // sessionError surfaces failure
      }
    })();
  };

  return (
    <View style={{ flex: 1, padding: 12, gap: 2 }}>
      <View style={{ gap: 2 }}>
        <If when={scopedBot()?.status === "ready" && !pendingApproval()}>
          <Press onPress={onNew} disabled={creatingSession()} accessibilityLabel="新建任务">
            <View
              hoverStyle={creatingSession() ? undefined : hovered()}
              style={{
                height: 40,
                borderRadius: radius.control,
                borderCurve: "continuous",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: colors.raised,
                ...finish.raised,
                borderWidth: 1,
                borderColor: colors.border,
                cursor: creatingSession() ? "default" : "pointer",
                opacity: creatingSession() ? 0.6 : 1,
              }}
            >
              <Icon name="plus" size={15} tint={colors.text} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>
                {creatingSession() ? "正在新建…" : "新建任务"}
              </Text>
            </View>
          </Press>
        </If>

        <Text
          desktop={{ windowDrag: true }}
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: colors.faint,
            letterSpacing: 0.6,
            paddingHorizontal: 12,
            paddingTop: 18,
            paddingBottom: 6,
          }}
        >
          {scopedBot() ? `${scopedBot()?.name} 的会话` : "全部会话"}
        </Text>
        <If when={sessionError()}>
          <Text
            style={{ fontSize: 12, lineHeight: 18, color: colors.danger, paddingHorizontal: 12 }}
          >
            {sessionError()}
          </Text>
        </If>
      </View>

      <If
        when={rows().length > 0}
        else={
          <View style={{ gap: 10, paddingHorizontal: 12, paddingTop: 8 }}>
            <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
              {canCreate()
                ? "还没有会话。点上方新建任务。"
                : scopedBot()
                  ? "这个 Bot 还没有会话。"
                  : registry().bots.some((bot) => bot.status === "ready")
                    ? "还没有认领的会话。选一个就绪的 Bot 再新建。"
                    : "还没有认领的会话。先到 Bots 导入模板并初始化助手。"}
            </Text>
            <If when={!canCreate() && registry().bots.some((bot) => bot.status === "ready")}>
              <Each of={registry().bots.filter((bot) => bot.status === "ready")}>
                {(bot) => (
                  <Button
                    label={`打开「${bot().name}」`}
                    variant="secondary"
                    size="small"
                    onPress={() => openBotSessions(bot().id)}
                  />
                )}
              </Each>
            </If>
            <If when={!registry().bots.some((bot) => bot.status === "ready")}>
              <Button
                label="去 Bots"
                variant="secondary"
                size="small"
                onPress={() => openModule("bots")}
              />
            </If>
          </View>
        }
      >
        <Each of={rows()}>
          {(row) => {
            const active = () => selectedId() === row().id || activeSessionId() === row().id;
            return (
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: radius.control,
                  gap: 8,
                  backgroundColor: active() ? colors.accentFill : "transparent",
                }}
              >
                <View
                  onPress={() => {
                    if (row().missing) return;
                    if (approvalLock({ sessionId: row().id })) return;
                    selectItem(row().id);
                    bumpChatEpoch();
                    openMain(row().id);
                  }}
                  role="button"
                  accessibilityLabel={row().label}
                  accessibilityState={{ selected: active() }}
                  hoverStyle={active() ? undefined : hovered()}
                  style={{ gap: 2, cursor: row().missing ? "default" : "pointer" }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: active() ? "600" : "400",
                      color: active() ? colors.onAccent : colors.text,
                    }}
                  >
                    {row().label}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: active() ? alpha(colors.onAccent, 0.78) : colors.muted,
                    }}
                  >
                    {row().detail}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    label="所属 Bot"
                    variant="secondary"
                    size="small"
                    onPress={() => openOwningBot(row().botId)}
                  />
                  <If when={row().missing}>
                    <Button
                      label="解除认领"
                      variant="secondary"
                      size="small"
                      onPress={() => void releaseMissingSession(row().id)}
                    />
                  </If>
                </View>
              </View>
            );
          }}
        </Each>
      </If>
    </View>
  );
}
