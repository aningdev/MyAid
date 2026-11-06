import { Text, View } from "nsh";

import { Button } from "../../components/ui";
import { registry } from "../bots/state";
import { ChatPane } from "./ChatPane";
import {
  createAndOpenSession,
  openBotDialogues,
  openDialogueSessions,
  openModule,
} from "./navigate";
import { creatingSession, sessionError } from "./session/runtime";
import { sessionScopeBotId, sessionScopeDialogueId } from "./state";

/** Dialogue main: Session chat pane. */
export function DialogueMain(props: { selectedId: string | null }) {
  // Branch with `<If>` — component bodies run once; a plain `if` would stick on the empty state.
  return (
    <If
      when={props.selectedId}
      else={
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}
        >
          <Text class="text-foreground text-lg font-semibold">Dialogue</Text>
          <EmptyHint />
        </View>
      }
    >
      {(id) => <ChatPane selectedId={id()} />}
    </If>
  );
}

function EmptyHint() {
  const readyBots = () => registry().bots.filter((bot) => bot.status === "ready");
  const scopedBot = () => registry().bots.find((bot) => bot.id === sessionScopeBotId()) ?? null;
  const scopedDialogue = () =>
    registry().dialogues.find((item) => item.id === sessionScopeDialogueId()) ?? null;
  const botDialogues = () => {
    const botId = sessionScopeBotId();
    if (!botId) return [];
    return registry().dialogues.filter((item) => item.botId === botId && !item.archived);
  };

  const createForDialogue = (dialogueId: string) => {
    if (creatingSession()) return;
    void createAndOpenSession(dialogueId).catch(() => undefined);
  };

  return (
    <View style={{ gap: 12, alignItems: "center", maxWidth: 360 }}>
      <Text class="text-muted-foreground text-center text-sm" style={{ lineHeight: 20 }}>
        {scopedDialogue()
          ? `在「${scopedDialogue()?.workspacePath}」下新建 Session，或从左侧选择已有会话。`
          : scopedBot()
            ? `选择「${scopedBot()?.name}」下的一段 Dialogue，或新建上下文。`
            : readyBots().length > 0
              ? "选择左侧会话，或打开某个就绪 Bot 的 Dialogue 列表。"
              : "先到 Bots 导入模板并初始化一个助手，再回来新建上下文。"}
      </Text>
      <If when={sessionError()}>
        <Text class="text-destructive text-center text-xs">{sessionError()}</Text>
      </If>
      <If when={scopedDialogue()}>
        <Button
          label={creatingSession() ? "正在新建…" : "新建 Session"}
          disabled={creatingSession()}
          onPress={() => createForDialogue(scopedDialogue()!.id)}
        />
      </If>
      <If when={!scopedDialogue() && scopedBot() && botDialogues().length > 0}>
        <View style={{ gap: 8, alignSelf: "stretch" }}>
          <Each of={botDialogues()}>
            {(dialogue) => (
              <Button
                label={dialogue().workspacePath}
                variant="secondary"
                onPress={() => openDialogueSessions(dialogue().id)}
              />
            )}
          </Each>
        </View>
      </If>
      <If when={!scopedBot() && readyBots().length > 0}>
        <View style={{ gap: 8, alignSelf: "stretch" }}>
          <Each of={readyBots()}>
            {(bot) => (
              <Button
                label={`打开「${bot().name}」的 Dialogues`}
                variant="secondary"
                onPress={() => openBotDialogues(bot().id)}
              />
            )}
          </Each>
        </View>
      </If>
      <If when={readyBots().length === 0}>
        <Button label="去 Bots" variant="secondary" onPress={() => openModule("bots")} />
      </If>
    </View>
  );
}
