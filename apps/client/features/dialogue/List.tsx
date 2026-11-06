import { effect, Text, View } from "nsh";

import { alpha, Button, colors, finish, hovered, Icon, Press, radius } from "../../components/ui";
import { changeRegistry, registry } from "../bots/state";
import { createDialogue } from "../bots/model";
import { openMain } from "./nav";
import {
  createAndOpenSession,
  openBotDialogues,
  openDialogueSessions,
  openModule,
  openOwningBot,
} from "./navigate";
import {
  activeSessionId,
  approvalLock,
  creatingSession,
  pendingApproval,
  refreshSessionList,
  releaseMissingSession,
  sessionError,
  sessionList,
} from "./session/runtime";
import {
  bumpChatEpoch,
  selectItem,
  selectedId,
  sessionScopeBotId,
  sessionScopeDialogueId,
} from "./state";

/** Dialogue list: Dialogues scoped to a Bot, or Sessions scoped to a Dialogue. */
export function DialogueList() {
  effect(() => {
    registry();
    sessionScopeBotId();
    sessionScopeDialogueId();
    void refreshSessionList();
  });

  const scopeDialogue = () =>
    registry().dialogues.find((item) => item.id === sessionScopeDialogueId()) ?? null;
  const scopedBot = () => registry().bots.find((bot) => bot.id === sessionScopeBotId()) ?? null;
  const botDialogues = () => {
    const botId = sessionScopeBotId();
    if (!botId || sessionScopeDialogueId()) return [];
    return registry().dialogues.filter((item) => item.botId === botId && !item.archived);
  };
  const rows = () => sessionList();
  const canCreateSession = () =>
    !!scopeDialogue() &&
    !scopeDialogue()?.archived &&
    scopedBot()?.status === "ready" &&
    !pendingApproval() &&
    !creatingSession();

  const onNewSession = () => {
    const dialogueId = scopeDialogue()?.id;
    if (!dialogueId || creatingSession()) return;
    void createAndOpenSession(dialogueId).catch(() => undefined);
  };

  const onNewDialogue = () => {
    const bot = scopedBot();
    if (!bot || bot.status !== "ready" || pendingApproval()) return;
    void createDialogueFromPicker(bot.id);
  };

  return (
    <View style={{ flex: 1, padding: 12, gap: 2 }}>
      <View style={{ gap: 2 }}>
        <If when={canCreateSession()}>
          <Press onPress={onNewSession} disabled={creatingSession()} accessibilityLabel="新建 Session">
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
                {creatingSession() ? "正在新建…" : "新建 Session"}
              </Text>
            </View>
          </Press>
        </If>

        <If
          when={
            !sessionScopeDialogueId() &&
            scopedBot()?.status === "ready" &&
            !pendingApproval()
          }
        >
          <Press onPress={onNewDialogue} accessibilityLabel="新上下文">
            <View
              hoverStyle={hovered()}
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
                cursor: "pointer",
              }}
            >
              <Icon name="plus" size={15} tint={colors.text} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>新上下文</Text>
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
          {scopeDialogue()
            ? scopeDialogue()?.workspacePath ?? "Session"
            : scopedBot()
              ? `${scopedBot()?.name} 的 Dialogue`
              : "全部会话"}
        </Text>
        <If when={sessionError()}>
          <Text
            style={{ fontSize: 12, lineHeight: 18, color: colors.danger, paddingHorizontal: 12 }}
          >
            {sessionError()}
          </Text>
        </If>
      </View>

      <If when={!!sessionScopeBotId() && !sessionScopeDialogueId()}>
        <If
          when={botDialogues().length > 0}
          else={
            <View style={{ gap: 10, paddingHorizontal: 12, paddingTop: 8 }}>
              <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
                还没有 Dialogue。点上方「新上下文」选择工作区。
              </Text>
            </View>
          }
        >
          <Each of={botDialogues()}>
            {(dialogue) => (
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderRadius: radius.control,
                  gap: 4,
                }}
              >
                <View
                  onPress={() => openDialogueSessions(dialogue().id)}
                  role="button"
                  accessibilityLabel={dialogue().workspacePath}
                  hoverStyle={hovered()}
                  style={{ gap: 2, cursor: "pointer" }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "500", color: colors.text }}>
                    {dialogue().workspacePath}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {dialogue().claims.length} 个 Session
                    {dialogue().archived ? " · 已归档" : ""}
                  </Text>
                </View>
              </View>
            )}
          </Each>
        </If>
      </If>

      <If when={!!sessionScopeDialogueId() || !sessionScopeBotId()}>
        <If
          when={rows().length > 0}
          else={
            <View style={{ gap: 10, paddingHorizontal: 12, paddingTop: 8 }}>
              <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 18 }}>
                {canCreateSession()
                  ? "还没有 Session。点上方新建。"
                  : scopeDialogue()
                    ? "这段 Dialogue 还没有 Session。"
                    : registry().bots.some((bot) => bot.status === "ready")
                      ? "还没有认领的会话。选一个就绪的 Bot 再新建上下文。"
                      : "还没有认领的会话。先到 Bots 导入模板并初始化助手。"}
              </Text>
              <If when={!canCreateSession() && registry().bots.some((bot) => bot.status === "ready")}>
                <Each of={registry().bots.filter((bot) => bot.status === "ready")}>
                  {(bot) => (
                    <Button
                      label={`打开「${bot().name}」`}
                      variant="secondary"
                      size="small"
                      onPress={() => openBotDialogues(bot().id)}
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
      </If>
    </View>
  );
}

async function createDialogueFromPicker(botId: string): Promise<void> {
  try {
    const { pickDirectory } = await import("../../lib/dsh/session");
    const path = await pickDirectory();
    if (!path) return;
    const saved = await changeRegistry((reg) =>
      createDialogue(reg, { botId, workspacePath: path }),
    );
    if (!saved) return;
    const created = saved.dialogues.filter((item) => item.botId === botId).at(-1);
    if (created) openDialogueSessions(created.id);
  } catch (error) {
    sessionError.set(error instanceof Error ? error.message : String(error));
  }
}
