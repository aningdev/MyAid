/**
 * The shell's standing notices above the Host footer: a Workspace stream that
 * is reconnecting, and a failed Registry command. Each is a refusal the person
 * can act on, so each carries its own dismissal instead of a sentence in a Pane.
 */
import { Info, TriangleAlert } from "lucide";
import { Text, View, token } from "nsh";

import { actionError, clearActionError } from "../../features/bots/state";
import { workspaceError } from "../../features/workspace/state";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { Alert, AlertDescription, ALERT_ICON } from "../ui/alert";
import { Button } from "../ui/button";

export function ShellNotices() {
  const anyNotices = () => !!actionError() || !!workspaceError();
  return (
    <If when={anyNotices()}>
      <View style={{ gap: 6, paddingHorizontal: 8, paddingBottom: 6 }}>
        <If when={!!workspaceError()}>
          <Notice
            testID="workspace-stream-notice"
            text={t("notices.workspace", { error: workspaceError() ?? "" })}
          />
        </If>
        <If when={!!actionError()}>
          <Notice
            testID="action-error-notice"
            destructive
            text={actionError() ?? ""}
            onDismiss={clearActionError}
          />
        </If>
      </View>
    </If>
  );
}

/** A notice and the refusals it offers: the mark, the sentence, and the buttons under it. */
function Notice(props: {
  testID: string;
  text: string;
  /** A failure, rather than something to reconnect. */
  destructive?: boolean;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
}) {
  const destructive = () => props.destructive === true;
  return (
    <Alert testID={props.testID} variant={destructive() ? "destructive" : "default"}>
      <Icon
        icon={destructive() ? TriangleAlert : Info}
        size={ALERT_ICON}
        tint={destructive() ? token("destructive") : token("foreground")}
      />
      <AlertDescription>
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
      </AlertDescription>
    </Alert>
  );
}
