/**
 * A Session's Panel content: the chat bound to that claimed Session, with its
 * approvals. The runtime follows one Session at a time (B1): a Panel whose
 * Session is not the live one says so and takes it over on request.
 */
import { effect, signal, Text, View } from "nsh";

import { Button, colors, radius } from "../../components/ui";
import { claimOwner } from "../bots/model";
import { sessionLabel } from "../bots/sessions";
import { registry } from "../bots/state";
import { ChatPane } from "./ChatPane";
import {
  activeSessionId,
  answerApproval,
  openSession,
  pendingApproval,
  sessionError,
  sessionList,
} from "./session/runtime";

export function SessionPanel(props: { panelId: string; sessionId: string }) {
  const owner = () => claimOwner(registry(), props.sessionId);
  const row = () => sessionList().find((item) => item.id === props.sessionId) ?? null;
  const label = () => row()?.label ?? sessionLabel({ title: owner()?.claim.title ?? null }, null);
  const context = () => {
    const current = owner();
    return current ? `${current.bot.name} · ${current.dialogue.workspacePath}` : "";
  };
  /** Another Session is the live one: this Panel must not take over by itself. */
  const elsewhere = () => {
    const live = activeSessionId();
    return live !== null && live !== props.sessionId;
  };
  const connecting = signal(false);

  // Opening a Session's Panel makes it the live one, unless another Session
  // (or another Panel's Session) is already live.
  effect(() => {
    const id = props.sessionId;
    if (!id || elsewhere()) return;
    void openSession(id).catch(() => undefined);
  });

  const continueHere = async (): Promise<void> => {
    if (connecting()) return;
    connecting.set(true);
    try {
      await openSession(props.sessionId);
    } catch {
      // sessionError says why (Host down, missing session…).
    } finally {
      connecting.set(false);
    }
  };

  return (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, backgroundColor: colors.background }}>
      <View
        class="border-border h-8 shrink-0 flex-row items-center gap-2 border-b px-3"
        style={{ backgroundColor: colors.background }}
      >
        <Text style={{ flex: 1, fontSize: 12, color: colors.muted, numberOfLines: 1 }}>
          {context()}
        </Text>
      </View>
      <If when={pendingApproval()?.sessionId === props.sessionId}>
        <ApprovalBar />
      </If>
      <If when={elsewhere()} else={<ChatPane selectedId={props.sessionId} />}>
        <View class="flex-1 items-center justify-center gap-3 p-6">
          <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>{label()}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, numberOfLines: 1 }}>{context()}</Text>
          <Text
            style={{
              fontSize: 12,
              lineHeight: 18,
              color: colors.faint,
              textAlign: "center",
              maxWidth: 340,
            }}
          >
            Another Session is live. One Session runs at a time here, so this one waits.
          </Text>
          <If when={sessionError()}>
            <Text
              style={{ fontSize: 12, lineHeight: 18, color: colors.danger, textAlign: "center" }}
            >
              {sessionError()}
            </Text>
          </If>
          <Button
            label="Continue here"
            variant="accent"
            size="small"
            disabled={connecting()}
            onPress={() => void continueHere()}
          />
        </View>
      </If>
    </View>
  );
}

/** A tool call that waits on the person: the decision goes to the runtime. */
function ApprovalBar() {
  return (
    <View
      class="shrink-0 gap-2 px-3 py-2"
      style={{
        backgroundColor: colors.raised,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        borderTopLeftRadius: radius.control,
        borderTopRightRadius: radius.control,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>
        需要审批：{pendingApproval()?.toolName}
      </Text>
      <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
        {pendingApproval()?.reason}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="允许一次" size="small" onPress={() => answerApproval("allowed-once")} />
        <Button
          label="拒绝"
          variant="secondary"
          size="small"
          onPress={() => answerApproval("rejected")}
        />
      </View>
    </View>
  );
}
