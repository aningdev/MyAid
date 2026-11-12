/**
 * A Session's Panel content: the chat bound to that claimed Session and its
 * own pending approvals. Every Panel gets its own controller, so two Panels
 * can show (and stream) two Sessions at once; two Panels on the same Session
 * share one controller and therefore one transcript and one draft.
 */
import { Text, View } from "nsh";

import { Button, colors, radius } from "../../components/ui";
import { claimOwner } from "../bots/model";
import { sessionLabel } from "../bots/sessions";
import { registry } from "../bots/state";
import { ChatPane } from "./ChatPane";
import type { SessionController } from "./session/controller";
import { controllerFor, sessionList } from "./session/runtime";

export function SessionPanel(props: { panelId: string; sessionId: string }) {
  const controller = (): SessionController => controllerFor(props.sessionId);
  const owner = () => claimOwner(registry(), props.sessionId);
  const row = () => sessionList().find((item) => item.id === props.sessionId) ?? null;
  const label = () => row()?.label ?? sessionLabel({ title: owner()?.claim.title ?? null }, null);
  const context = () => {
    const current = owner();
    return current ? `${current.bot.name} · ${current.dialogue.workspacePath}` : "";
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
      <If when={controller().pendingApproval()}>
        <ApprovalBar controller={controller()} label={label()} />
      </If>
      <ChatPane controller={controller()} />
    </View>
  );
}

/** A tool call that waits on the person: the decision goes to its own Session. */
function ApprovalBar(props: { controller: SessionController; label: string }) {
  const request = () => props.controller.pendingApproval();
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
        需要审批：{request()?.toolName}
      </Text>
      <Text style={{ fontSize: 12, lineHeight: 18, color: colors.muted }}>
        {props.label} · {request()?.reason}
      </Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button
          label="允许一次"
          size="small"
          onPress={() => props.controller.answerApproval("allowed-once")}
        />
        <Button
          label="拒绝"
          variant="secondary"
          size="small"
          onPress={() => props.controller.answerApproval("rejected")}
        />
      </View>
    </View>
  );
}
