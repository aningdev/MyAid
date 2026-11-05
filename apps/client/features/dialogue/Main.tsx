import { Text, View } from "nsh";

import { Button } from "../../components/ui";
import { registry } from "../bots/state";
import { ChatPane } from "./ChatPane";
import { openMain } from "./nav";
import { openBotSessions, openModule } from "./navigate";
import { createSession, creatingSession, sessionError } from "./session/runtime";
import { bumpChatEpoch, selectItem, sessionScopeBotId } from "./state";

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
          <Text class="text-lg font-semibold text-foreground">Dialogue</Text>
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
  const scoped = () => registry().bots.find((bot) => bot.id === sessionScopeBotId()) ?? null;

  const createFor = (botId: string) => {
    if (creatingSession()) return;
    void (async () => {
      try {
        sessionScopeBotId.set(botId);
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
    <View style={{ gap: 12, alignItems: "center", maxWidth: 360 }}>
      <Text class="text-sm text-center text-muted-foreground" style={{ lineHeight: 20 }}>
        {scoped()
          ? `在「${scoped()?.name}」下新建任务，或从左侧选择已有会话。`
          : readyBots().length > 0
            ? "选择左侧会话，或在某个就绪的 Bot 下新建任务。"
            : "先到 Bots 导入模板并初始化一个助手，再回来新建任务。"}
      </Text>
      <If when={sessionError()}>
        <Text class="text-xs text-center text-destructive">{sessionError()}</Text>
      </If>
      <If when={scoped()?.status === "ready"}>
        <Button
          label={creatingSession() ? "正在新建…" : "新建任务"}
          disabled={creatingSession()}
          onPress={() => createFor(scoped()!.id)}
        />
      </If>
      <If when={!scoped() && readyBots().length > 0}>
        <View style={{ gap: 8, alignSelf: "stretch" }}>
          <Each of={readyBots()}>
            {(bot) => (
              <View style={{ gap: 6 }}>
                <Button
                  label={creatingSession() ? "正在新建…" : `在「${bot().name}」下新建`}
                  variant="secondary"
                  disabled={creatingSession()}
                  onPress={() => createFor(bot().id)}
                />
                <Button
                  label={`打开「${bot().name}」的会话列表`}
                  variant="secondary"
                  size="small"
                  onPress={() => openBotSessions(bot().id)}
                />
              </View>
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
