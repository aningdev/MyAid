/**
 * The shell's standing notices above the Host footer: a Workspace stream that
 * is reconnecting, a registry that still needs the one Host that can migrate
 * it, a failed command, and a Session dsh refused to archive because it is
 * still working. Each is a refusal the person can act on, so each carries its
 * own retry or dismissal instead of a sentence in a Panel.
 */
import { Text, View } from "nsh";

import { claimOwner } from "../../features/bots/model";
import { sessionLabel } from "../../features/bots/sessions";
import {
  actionError,
  clearActionError,
  legacyRegistry,
  migrationNotice,
  registry,
  setActionError,
} from "../../features/bots/state";
import {
  archiveBlocked,
  dismissArchiveBlocked,
  messageOf,
  stopAndArchiveBlocked,
} from "../../features/workspace/dialogues";
import { workspaceError } from "../../features/workspace/state";
import { Button, colors } from "../ui";
import { retryHost } from "./host";

export function ShellNotices() {
  const anyNotices = () =>
    !!migrationNotice() || !!archiveBlocked() || !!actionError() || !!workspaceError();
  return (
    <If when={anyNotices()}>
      <View style={{ gap: 6, paddingHorizontal: 8, paddingBottom: 6 }}>
        <If when={!!workspaceError()}>
          <Notice
            testID="workspace-stream-notice"
            tone="warn"
            text={`Workspace 状态断开了，正在重连：${workspaceError() ?? ""}`}
          />
        </If>
        <If when={!!migrationNotice()}>
          <Notice
            testID="migration-notice"
            tone="warn"
            text={migrationNotice() ?? ""}
            action={legacyRegistry() ? "Connect Host" : undefined}
            onAction={() => void retryHost()}
            onDismiss={legacyRegistry() ? undefined : () => migrationNotice.set(null)}
          />
        </If>
        <If when={!!actionError()}>
          <Notice
            testID="action-error-notice"
            tone="danger"
            text={actionError() ?? ""}
            onDismiss={clearActionError}
          />
        </If>
        <If when={!!archiveBlocked()}>
          <Notice
            testID="archive-active-notice"
            tone="warn"
            text={archiveBlockedText()}
            action="Stop and archive"
            onAction={() => void stopAndArchive()}
            onDismiss={dismissArchiveBlocked}
          />
        </If>
      </View>
    </If>
  );
}

function Notice(props: {
  testID: string;
  tone: "warn" | "danger";
  text: string;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <View
      testID={props.testID}
      style={{
        gap: 6,
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: props.tone === "danger" ? colors.danger : colors.line,
        backgroundColor: colors.inset,
      }}
    >
      <Text style={{ fontSize: 11, lineHeight: 16, color: colors.muted }}>{props.text}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <If when={!!props.action}>
          <Button
            label={props.action ?? ""}
            size="small"
            variant="accent"
            onPress={() => props.onAction?.()}
          />
        </If>
        <If when={!!props.onDismiss}>
          <Button label="Cancel" size="small" variant="ghost" onPress={() => props.onDismiss?.()} />
        </If>
      </View>
    </View>
  );
}

function archiveBlockedText(): string {
  const blocked = archiveBlocked();
  if (!blocked) return "";
  const names = blocked.refusals.map((refusal) => {
    const owner = claimOwner(registry(), refusal.sessionId);
    return owner ? sessionLabel(owner.claim, null) : "这条会话";
  });
  const work = [...new Set(blocked.refusals.map((refusal) => refusal.activity))]
    .filter(Boolean)
    .join(" · ");
  const who = names.length > 1 ? `${names.length} 条会话（${names.join("、")}）` : names[0];
  const activity = work ? `（${work}）` : "";
  const whole = blocked.dialogueId ? "这段 Dialogue 的会话" : who;
  return `${whole}还在执行${activity}，dsh 拒绝了归档。先停掉，再归档。`;
}

async function stopAndArchive(): Promise<void> {
  try {
    await stopAndArchiveBlocked();
  } catch (error) {
    // A refusal keeps its own notice; anything else is a transport failure.
    setActionError(messageOf(error));
    dismissArchiveBlocked();
  }
}
