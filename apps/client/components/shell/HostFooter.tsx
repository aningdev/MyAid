/**
 * The sidebar's last row: whether this Client reaches the Host, the way to try
 * again, and the way into Settings. It is a fact row, not a command bar: one
 * line, one setting.
 *
 * When the launcher cannot run a Host (no binary, a launch that failed, one
 * that keeps exiting) this is the Host empty state: the launcher's status in
 * words and the command that starts one by hand.
 */
import { SlidersHorizontal } from "lucide";
import { signal, Text, View, token } from "nsh";

import { hostConnection } from "../../features/dialogue/session/runtime";
import {
  hostLauncherStatus,
  launcherFailureText,
  MANUAL_HOST_COMMAND,
} from "../../lib/host/launcher";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { Button } from "../ui/button";
import { hasHost, retryHost } from "./host";
import { openSettings } from "./settings";

export function HostFooter() {
  const up = () => hostConnection() === "up";
  const launcher = () => hostLauncherStatus();
  const starting = () =>
    !up() && (launcher().phase === "probing" || launcher().phase === "starting");
  const failed = () => !up() && launcher().phase === "failed";
  const busy = signal(false);

  const retry = async (): Promise<void> => {
    if (busy()) return;
    busy.set(true);
    try {
      await retryHost();
    } finally {
      busy.set(false);
    }
  };

  const label = (): string => {
    if (up()) return t("host.connected");
    if (starting()) return t("host.starting");
    if (launcher().phase === "failed") return launcherFailureText(launcher().failure);
    return t("host.disconnected");
  };

  return (
    <View
      style={{
        flexShrink: 0,
        flexDirection: "column",
        gap: 2,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderTopWidth: 1,
        borderTopColor: token("line"),
        backgroundColor: token("inset"),
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: up() ? token("up") : failed() ? token("destructive") : token("faint"),
          }}
        />
        <View testID="host-status" style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 11,
              color: token("muted-foreground"),
              numberOfLines: 2,
            }}
          >
            {label()}
          </Text>
        </View>
        <If when={!up()}>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasHost || busy()}
            onPress={() => void retry()}
          >
            {t("common.retry")}
          </Button>
        </If>
        <View
          role="button"
          onPress={openSettings}
          accessibilityLabel={t("host.settings")}
          hoverStyle={{ opacity: 0.7 }}
          style={{ width: 22, height: 22, alignItems: "center", justifyContent: "center" }}
        >
          <Icon icon={SlidersHorizontal} size={14} tint={token("muted-foreground")} />
        </View>
      </View>
      <If when={!up() && hasHost}>
        <Text
          style={{
            fontSize: 11,
            color: token("faint"),
            numberOfLines: 1,
          }}
        >
          {t("host.manual", { command: MANUAL_HOST_COMMAND })}
        </Text>
      </If>
    </View>
  );
}
