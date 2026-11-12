/**
 * The Session's header inside its Panel: the bot and the Session's title, the
 * workspace under it, the model it runs on. The transcript scrolls under it;
 * a hairline appears only once it is scrolled. A double click on the title
 * renames the Session (the claim and dsh agree).
 */
import { Text, View } from "nsh";
import { signal } from "nsh";
import { Input } from "nsh/base";

import { colors, Icon } from "../../../components/ui";
import { BotMark } from "../../bots/BotMark";
import type { Bot } from "../../bots/model";

export function ChatHeader(props: {
  title: () => string;
  subtitle: () => string;
  modelLabel: () => string;
  scrolled: () => boolean;
  bot: () => Bot | null;
  working: () => boolean;
  onRename: (title: string) => void;
}) {
  const editing = signal(false);
  const draft = signal("");

  const commit = () => {
    const title = draft().trim();
    editing.set(false);
    if (title) props.onRename(title);
  };

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 2,
        borderBottomWidth: 1,
        borderBottomColor: props.scrolled() ? colors.line : "transparent",
        backgroundColor: colors.background,
        transitionProperty: "colors",
        transitionDuration: 150,
        zIndex: 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <If when={props.bot()}>
          {(bot) => <BotMark identity={bot().identity} size={20} working={props.working()} />}
        </If>
        <If
          when={editing()}
          else={
            <View
              onPress={(event) => {
                if (event.clickCount < 2) return;
                draft.set(props.title());
                editing.set(true);
              }}
              tooltip={<Text style={{ fontSize: 12 }}>Double click to rename</Text>}
              style={{ flex: 1 }}
            >
              <Text
                style={{ numberOfLines: 1, fontSize: 15, fontWeight: "600", color: colors.text }}
              >
                {props.title()}
              </Text>
            </View>
          }
        >
          <Input
            value={draft()}
            onChange={(event) => draft.set(event.value)}
            onSubmit={commit}
            onBlur={commit}
            autoFocus
            testID="session-title"
            style={{
              flex: 1,
              height: 26,
              fontSize: 15,
              fontWeight: "600",
              color: colors.text,
              paddingHorizontal: 6,
            }}
          />
        </If>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            height: 22,
            paddingHorizontal: 8,
            borderRadius: 11,
            backgroundColor: colors.inset,
          }}
        >
          <Icon name="spark" size={11} tint={colors.faint} />
          <Text style={{ numberOfLines: 1, fontSize: 11, color: colors.muted }}>
            {props.modelLabel()}
          </Text>
        </View>
      </View>
      <Text
        style={{ numberOfLines: 1, fontSize: 11, color: colors.faint }}
        testID="session-workspace"
      >
        {props.subtitle()}
      </Text>
    </View>
  );
}
