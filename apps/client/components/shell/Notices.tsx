/**
 * The shell's standing notices above the Host footer: a Workspace stream that
 * is reconnecting, a registry that still needs the one Host that can migrate
 * it, and a failed command. Each is a refusal the person can act on, so each
 * carries its own retry or dismissal instead of a sentence in a Pane.
 */
import { Text, View, token } from "nsh";

import {
  actionError,
  clearActionError,
  legacyRegistry,
  migrationNotice,
} from "../../features/bots/state";
import { workspaceError } from "../../features/workspace/state";
import { t } from "../../lib/i18n";
import { Button } from "../ui/button";
import { retryHost } from "./host";

export function ShellNotices() {
  const anyNotices = () => !!migrationNotice() || !!actionError() || !!workspaceError();
  return (
    <If when={anyNotices()}>
      <View style={{ gap: 6, paddingHorizontal: 8, paddingBottom: 6 }}>
        <If when={!!workspaceError()}>
          <Notice
            testID="workspace-stream-notice"
            tone="warn"
            text={t("notices.workspace", { error: workspaceError() ?? "" })}
          />
        </If>
        <If when={!!migrationNotice()}>
          <Notice
            testID="migration-notice"
            tone="warn"
            text={migrationNotice() ?? ""}
            action={legacyRegistry() ? t("notices.connectHost") : undefined}
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
        borderColor: props.tone === "danger" ? token("destructive") : token("line"),
        backgroundColor: token("inset"),
      }}
    >
      <Text style={{ fontSize: 11, lineHeight: 16, color: token("muted-foreground") }}>
        {props.text}
      </Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <If when={!!props.action}>
          <Button size="sm" onPress={() => props.onAction?.()}>
            {props.action ?? ""}
          </Button>
        </If>
        <If when={!!props.onDismiss}>
          <Button size="sm" variant="ghost" onPress={() => props.onDismiss?.()}>
            {t("common.cancel")}
          </Button>
        </If>
      </View>
    </View>
  );
}
