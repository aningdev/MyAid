/**
 * A Dialogue's Panel content: which Bot and workspace it is, and the claimed
 * Sessions under it. A session opens in this Panel; "New Session" creates and
 * claims one, then shows it here.
 */
import { Scroll, Text, View } from "nsh";

import { dialogueLabels, sessionAddress } from "../../components/shell/navAddresses";
import { setPanelAddress } from "../../components/shell/state";
import { Badge, Button, colors, hovered, mono, radius } from "../../components/ui";
import { sessionLabel } from "../bots/sessions";
import { ready, registry } from "../bots/state";
import { unarchiveDialogueSession } from "../workspace/dialogues";
import { isSessionArchived, workspacePath, workspaceTitle, workspaces } from "../workspace/state";
import { rosterForDialogue } from "./session/roster";
import {
  createSession,
  creatingSession,
  hasPendingApproval,
  sessionError,
  sessionList,
} from "./session/runtime";

export function DialoguePanel(props: { panelId: string; dialogueId: string }) {
  const dialogue = () => registry().dialogues.find((item) => item.id === props.dialogueId) ?? null;
  const bot = () => {
    const id = dialogue()?.botId;
    return id ? (registry().bots.find((item) => item.id === id) ?? null) : null;
  };
  const rows = () =>
    rosterForDialogue({
      registry: registry(),
      dialogueId: props.dialogueId,
      rows: sessionList(),
      workspaces: workspaces(),
    });
  const canCreate = () => !!dialogue() && bot()?.status === "ready" && !creatingSession();

  /**
   * Sessions dsh archived for this Dialogue: the roster leaves them out, so
   * they are read from the claims and dsh's archive set directly.
   */
  const archivedRows = () => {
    const current = dialogue();
    if (!current) return [];
    return current.claims
      .filter((claim) => isSessionArchived(workspaces(), claim.sessionId))
      .map((claim) => ({
        id: claim.sessionId,
        label: sessionLabel(claim, null),
      }));
  };

  /** The name this Dialogue reads by among its siblings (two can share a title). */
  const label = () => {
    const current = dialogue();
    if (!current) return "";
    const names = dialogueLabels({
      dialogues: registry().dialogues.map((item) => ({
        id: item.id,
        botId: item.botId,
        title: workspaceTitle(workspaces(), item),
      })),
      botName: (id) => registry().bots.find((bot) => bot.id === id)?.name ?? "",
    });
    return names.get(current.id)?.full ?? "";
  };

  const openSession = (sessionId: string, label: string) => {
    setPanelAddress(
      props.panelId,
      sessionAddress({
        sessionId,
        label,
        botId: dialogue()?.botId,
        dialogueId: props.dialogueId,
      }),
    );
  };

  const unarchive = async (sessionId: string): Promise<void> => {
    try {
      await unarchiveDialogueSession(sessionId);
    } catch {
      // sessionError names the reason (Host down, missing Session).
    }
  };

  const create = async (): Promise<void> => {
    if (!canCreate()) return;
    try {
      const id = await createSession(props.dialogueId);
      const claim = dialogue()?.claims.find((item) => item.sessionId === id);
      openSession(id, sessionLabel(claim ?? { title: null }, null));
    } catch {
      // sessionError says why (Host down, not ready, occupied…).
    }
  };

  return (
    <Scroll style={{ flex: 1 }} contentStyle={{ padding: 16, gap: 16 }}>
      <If when={dialogue()} else={<NotInRegistry ready={ready()} />}>
        {(current) => (
          <View style={{ gap: 16, maxWidth: 640 }}>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 18, fontWeight: "600", color: colors.text }}>
                  {label()}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {bot()?.name ?? "Bot 不在了"}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.faint,
                  fontFamily: mono,
                  userSelect: "text",
                }}
              >
                {workspacePath(workspaces(), current())}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button
                label={creatingSession() ? "正在新建…" : "New Session"}
                variant="accent"
                size="small"
                disabled={!canCreate()}
                onPress={() => void create()}
              />
              <If when={hasPendingApproval()}>
                <Text style={{ fontSize: 12, color: colors.warn, alignSelf: "center" }}>
                  有审批没答复，先到那条会话里处理。
                </Text>
              </If>
            </View>
            <If when={sessionError()}>
              <Text style={{ fontSize: 12, lineHeight: 18, color: colors.danger }}>
                {sessionError()}
              </Text>
            </If>
            <View style={{ height: 1, backgroundColor: colors.line }} />
            <View style={{ gap: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>Session</Text>
              <If
                when={rows().length > 0}
                else={
                  <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
                    还没有 Session。点上面「New Session」开一条。
                  </Text>
                }
              >
                <View style={{ gap: 2 }}>
                  <Each of={rows()}>
                    {(row) => (
                      <SessionRowView
                        label={row().label}
                        detail={row().detail}
                        running={row().running}
                        missing={row().missing}
                        onPress={() => openSession(row().id, row().label)}
                      />
                    )}
                  </Each>
                </View>
              </If>
            </View>
            <If when={archivedRows().length > 0}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>已归档</Text>
                <View style={{ gap: 2 }}>
                  <Each of={archivedRows()}>
                    {(row) => (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ flex: 1, fontSize: 13, color: colors.muted }}>
                          {row().label}
                        </Text>
                        <Button
                          label="Unarchive"
                          size="small"
                          variant="ghost"
                          onPress={() => void unarchive(row().id)}
                        />
                      </View>
                    )}
                  </Each>
                </View>
              </View>
            </If>
          </View>
        )}
      </If>
    </Scroll>
  );
}

function SessionRowView(props: {
  label: string;
  detail: string;
  running: boolean;
  missing: boolean;
  onPress: () => void;
}) {
  return (
    <View
      onPress={props.onPress}
      accessibilityLabel={props.label}
      hoverStyle={hovered()}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: radius.control,
        gap: 2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: "500", color: colors.text }}>
          {props.label}
        </Text>
        <If when={props.running}>
          <Badge label="执行中" tone="up" />
        </If>
        <If when={props.missing}>
          <Badge label="待核对" tone="warn" />
        </If>
      </View>
      <Text style={{ fontSize: 12, color: colors.muted, numberOfLines: 1 }}>{props.detail}</Text>
    </View>
  );
}

function NotInRegistry(props: { ready: boolean }) {
  return (
    <View style={{ gap: 6, maxWidth: 420 }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: colors.muted }}>
        {props.ready
          ? "这段 Dialogue 不在注册表里（可能是 Spaces 的示例面板）。"
          : "正在读取注册表…"}
      </Text>
    </View>
  );
}
