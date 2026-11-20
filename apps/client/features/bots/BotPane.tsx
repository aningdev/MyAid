/**
 * A Bot's Pane: its one long conversation. The Pane mounts the chat on the
 * **latest** segment — the only one that accepts prompts — and ChatPane loads
 * older segments into the same transcript as the person scrolls up.
 *
 * A Bot with no conversation starts one in its default working directory
 * (a picked folder when it has none): a dsh Workspace, then its first
 * segment. Both need the Host; without one the refusal is shown.
 */
import { MessageSquare, Sparkles } from "lucide";
import { signal, Text, View, token } from "nsh";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { requestComposerFocus } from "../dialogue/chat/focus";
import { ChatPane } from "../dialogue/ChatPane";
import { controllerFor, sessionError } from "../dialogue/session/runtime";
import { BotTickets } from "../tickets/BotTickets";
import { startSegment } from "../workspace/conversation";
import { workspaces } from "../workspace/state";
import { openBotDetails } from "./details";
import { currentSegmentOf } from "./sessions";
import { ready, registry } from "./state";

export function BotPane(props: { panelId: string; botId: string }) {
  const bot = () => registry().bots.find((item) => item.id === props.botId) ?? null;
  const segment = () =>
    currentSegmentOf({
      registry: registry(),
      workspaces: workspaces(),
      botId: props.botId,
    });

  /**
   * The Pane mounts the chat on the Session **id**, never on the projection
   * object: `currentSegmentOf` builds a new object per read, and a changing
   * truthy value would remount the chat (and release its controller) on every
   * roster change. The id stays the same while the same segment shows.
   */
  const segmentId = (): string | null => segment()?.segment.sessionId ?? null;

  return (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, backgroundColor: token("background") }}>
      <If when={bot()} else={<Missing ready={() => ready()} />}>
        <BotTickets botId={props.botId} />
        <If
          when={segmentId()}
          else={<NoSegment botId={props.botId} onOpenDetails={() => openBotDetails(props.botId)} />}
        >
          {(sessionId) => (
            <View style={{ flex: 1, minHeight: 0 }} testID="bot-pane">
              <ChatPane controller={controllerFor(sessionId())} history />
            </View>
          )}
        </If>
      </If>
    </View>
  );
}

/** A Bot that is no longer in the registry (deleted on another launch). */
function Missing(props: { ready: () => boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: 24 }}>
      <Icon icon={Sparkles} size={24} tint={token("faint")} />
      <Text style={{ fontSize: 14, fontWeight: "600", color: token("muted-foreground") }}>
        {props.ready() ? t("bot.gone") : t("bot.readingRegistry")}
      </Text>
      <If when={props.ready()}>
        <Text style={{ fontSize: 12, color: token("faint"), textAlign: "center" }}>
          {t("bot.goneHint")}
        </Text>
      </If>
    </View>
  );
}

/**
 * No segment yet: the one thing to do, in the Bot's default working directory.
 * A draft Bot cannot start one before it is initialized (Bot details).
 */
function NoSegment(props: { botId: string; onOpenDetails: () => void }) {
  const busy = signal(false);
  const bot = () => registry().bots.find((item) => item.id === props.botId) ?? null;
  const canStart = () => bot()?.status === "ready" && !busy();

  const start = async (): Promise<void> => {
    const current = bot();
    if (!current || busy()) return;
    busy.set(true);
    try {
      const sessionId = await startSegment(current.id, current.defaultWorkspacePath ?? undefined);
      if (sessionId) requestComposerFocus(sessionId);
    } finally {
      busy.set(false);
    }
  };

  return (
    <View
      testID="bot-pane-empty"
      style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <View style={{ alignItems: "center", gap: 12, maxWidth: 420 }}>
        <Icon icon={MessageSquare} size={24} tint={token("faint")} />
        <Text style={{ fontSize: 16, fontWeight: "600", color: token("foreground") }}>
          {t("bot.noConversation", { name: bot()?.name ?? t("bot.thisBot") })}
        </Text>
        <Text
          style={{
            fontSize: 12,
            lineHeight: 18,
            color: token("muted-foreground"),
            textAlign: "center",
          }}
        >
          {bot()?.status === "ready" ? t("bot.noConversationHint") : t("bot.setupFirst")}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <If
            when={bot()?.status === "ready"}
            else={<Button onPress={props.onOpenDetails}>{t("menu.botDetails")}</Button>}
          >
            <Button disabled={!canStart()} onPress={() => void start()}>
              {busy() ? t("bot.starting") : t("bot.startConversation")}
            </Button>
          </If>
        </View>
        <If when={sessionError()}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: token("destructive") }}>
            {sessionError()}
          </Text>
        </If>
        <If when={!!bot()?.archived}>
          <Badge tone="neutral">{t("bot.archivedBadge")}</Badge>
        </If>
      </View>
    </View>
  );
}
