/**
 * A Bot's Pane: its conversation. Until the Bot's own long conversation lands
 * (L2) the Pane shows the Bot's most recent Session — the one that moved last
 * per dsh's listing, else the newest claim of its most active dialogue — and
 * follows a new one as soon as it is claimed.
 *
 * A Bot with no conversation starts one in its default working directory
 * (a picked folder when it has none): a dialogue over a dsh Workspace, then
 * its first Session. Both need the Host; without one the refusal is shown.
 */
import { signal, Text, View } from "nsh";

import { Badge, Button, colors, Icon } from "../../components/ui";
import { requestComposerFocus } from "../dialogue/chat/focus";
import { ChatPane } from "../dialogue/ChatPane";
import {
  controllerFor,
  createSession,
  sessionError,
  sessionList,
} from "../dialogue/session/runtime";
import { createDialogueOnPath } from "../workspace/dialogues";
import { workspaces } from "../workspace/state";
import { openBotDetails } from "./details";
import { currentDialogueOf, currentSessionOf, type CurrentSession } from "./sessions";
import { ready, registry } from "./state";

export function BotPane(props: { panelId: string; botId: string }) {
  const bot = () => registry().bots.find((item) => item.id === props.botId) ?? null;
  const segment = (): CurrentSession | null =>
    currentSessionOf({
      registry: registry(),
      workspaces: workspaces(),
      rows: sessionList(),
      botId: props.botId,
    });

  return (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, backgroundColor: colors.background }}>
      <If when={bot()} else={<Missing ready={() => ready()} />}>
        <If
          when={segment()}
          else={<NoSegment botId={props.botId} onOpenDetails={() => openBotDetails(props.botId)} />}
        >
          {(current) => (
            <View style={{ flex: 1, minHeight: 0 }} testID="bot-pane">
              <ChatPane controller={controllerFor(current().sessionId)} />
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
      <Icon name="spark" size={24} tint={colors.faint} />
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.muted }}>
        {props.ready() ? "This Bot is gone" : "Reading the registry…"}
      </Text>
      <If when={props.ready()}>
        <Text style={{ fontSize: 12, color: colors.faint, textAlign: "center" }}>
          Pick another Bot in the list, or press ⌘N.
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
  const dialogue = () => currentDialogueOf(registry(), workspaces(), props.botId);
  const canStart = () => bot()?.status === "ready" && !busy();

  const start = async (): Promise<void> => {
    const current = bot();
    if (!current || busy()) return;
    busy.set(true);
    try {
      let path = current.defaultWorkspacePath ?? "";
      if (!path) {
        const { pickDirectory } = await import("../../lib/dsh/session");
        path = (await pickDirectory()) ?? "";
      }
      if (!path) return;
      const target = dialogue() ?? (await createDialogueOnPath(current.id, path));
      if (!target) return;
      const sessionId = await createSession(target.id);
      requestComposerFocus(sessionId);
    } catch {
      // `sessionError` / `actionError` name the reason on screen.
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
        <Icon name="chat" size={24} tint={colors.faint} />
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text }}>
          {`No conversation with ${bot()?.name ?? "this Bot"} yet`}
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: "center" }}>
          {bot()?.status === "ready"
            ? "Start one in its default working directory; a new segment follows."
            : "Finish setting this Bot up first: pick its preset and working directory."}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <If
            when={bot()?.status === "ready"}
            else={<Button label="Bot details…" variant="accent" onPress={props.onOpenDetails} />}
          >
            <Button
              label={busy() ? "Starting…" : "Start a conversation"}
              variant="accent"
              disabled={!canStart()}
              onPress={() => void start()}
            />
          </If>
        </View>
        <If when={sessionError()}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}>
            {sessionError()}
          </Text>
        </If>
        <If when={!!bot()?.archived}>
          <Badge label="Archived" tone="neutral" />
        </If>
      </View>
    </View>
  );
}
