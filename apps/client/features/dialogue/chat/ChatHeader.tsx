/**
 * The Session's header inside its Panel: the bot and the Session's title, the
 * Bot's current working directory under it, the model it runs on. The
 * transcript scrolls under it; a hairline appears only once it is scrolled. A
 * double click on the title renames the segment; a press on the directory edits
 * it, and a different directory starts a new segment.
 */
import { Check, Sparkles } from "lucide";
import { Text, View, token } from "nsh";
import { signal } from "nsh";
import { Input } from "nsh/base";

import { Press } from "../../../components/app";
import { t } from "../../../lib/i18n";
import { Icon } from "../../../lib/icons";
import { mono } from "../../../lib/theme";
import { BotMark } from "../../bots/BotMark";
import type { Bot } from "../../bots/model";

export function ChatHeader(props: {
  title: () => string;
  subtitle: () => string;
  /** The canonical working directory, for the tooltip and screen readers. */
  fullPath?: () => string;
  modelLabel: () => string;
  scrolled: () => boolean;
  bot: () => Bot | null;
  working: () => boolean;
  onRename: (title: string) => void;
  /** A new working directory; a different one starts a segment. */
  onWorkspace?: (path: string) => void;
}) {
  const editing = signal(false);
  const draft = signal("");
  const editingPath = signal(false);
  const pathDraft = signal("");

  const commit = () => {
    const title = draft().trim();
    editing.set(false);
    if (title) props.onRename(title);
  };

  const commitPath = () => {
    const path = pathDraft().trim();
    editingPath.set(false);
    if (!path || path === props.subtitle()) return;
    props.onWorkspace?.(path);
  };

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
        gap: 2,
        borderBottomWidth: 1,
        borderBottomColor: props.scrolled() ? token("line") : "transparent",
        backgroundColor: token("background"),
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
              tooltip={<Text style={{ fontSize: 12 }}>{t("chat.renameHint")}</Text>}
              style={{ flex: 1 }}
            >
              <Text
                style={{
                  numberOfLines: 1,
                  fontSize: 15,
                  fontWeight: "600",
                  color: token("foreground"),
                }}
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
              color: token("foreground"),
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
            backgroundColor: token("inset"),
          }}
        >
          <Icon icon={Sparkles} size={11} tint={token("faint")} />
          <Text style={{ numberOfLines: 1, fontSize: 11, color: token("muted-foreground") }}>
            {props.modelLabel()}
          </Text>
        </View>
      </View>
      <If
        when={editingPath()}
        else={
          <View
            onPress={() => {
              if (!props.onWorkspace) return;
              pathDraft.set(props.subtitle());
              editingPath.set(true);
            }}
            tooltip={
              props.onWorkspace ? (
                <View style={{ gap: 3, maxWidth: 460 }}>
                  <Text style={{ fontSize: 12 }}>{t("chat.workspaceHint")}</Text>
                  <Text
                    style={{ fontSize: 11, color: token("muted-foreground"), fontFamily: mono }}
                  >
                    {props.fullPath?.() || props.subtitle()}
                  </Text>
                </View>
              ) : undefined
            }
            style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 18 }}
          >
            <Text
              style={{ numberOfLines: 1, fontSize: 11, color: token("faint") }}
              testID="session-workspace"
            >
              {props.subtitle() || t("chat.chooseWorkspace")}
            </Text>
          </View>
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Input
            value={pathDraft()}
            onChange={(event) => pathDraft.set(event.value)}
            onSubmit={commitPath}
            onBlur={commitPath}
            autoFocus
            testID="session-workspace-input"
            accessibilityLabel={t("chat.workingDirectory")}
            style={{
              flex: 1,
              height: 24,
              fontSize: 11,
              color: token("foreground"),
              paddingHorizontal: 4,
            }}
          />
          <Press
            onPress={commitPath}
            accessibilityLabel={t("chat.useWorkspace")}
            scale={0.9}
            style={{ width: 22, height: 22 }}
          >
            <Icon icon={Check} size={12} tint={token("brand")} />
          </Press>
        </View>
      </If>
    </View>
  );
}
