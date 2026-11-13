/**
 * The sidebar's last row: whether this Client reaches the Host, and the way
 * to try again. It is a fact row, not a command bar: one line, one action.
 *
 * When the launcher cannot run a Host (no binary, a launch that failed, one
 * that keeps exiting) this is the Host empty state: the launcher's status in
 * words and the command that starts one by hand.
 */
import { signal, Text, View } from "nsh";

import { hostConnection } from "../../features/dialogue/session/runtime";
import {
  hostLauncherStatus,
  launcherFailureText,
  MANUAL_HOST_COMMAND,
} from "../../lib/host/launcher";
import { Button, colors } from "../ui";
import { hasHost, retryHost } from "./host";

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
    if (up()) return "Host connected";
    if (starting()) return "Starting Host…";
    if (launcher().phase === "failed") return launcherFailureText(launcher().failure);
    return "Host disconnected";
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
        borderTopColor: colors.line,
        backgroundColor: colors.inset,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: up() ? colors.up : failed() ? colors.danger : colors.faint,
          }}
        />
        <View testID="host-status" style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              color: colors.muted,
              numberOfLines: 2,
            }}
          >
            {label()}
          </Text>
        </View>
        <If when={!up()}>
          <Button
            label="Retry"
            size="small"
            disabled={!hasHost || busy()}
            onPress={() => void retry()}
          />
        </If>
      </View>
      <If when={!up() && hasHost}>
        <Text
          style={{
            fontSize: 11,
            color: colors.faint,
            numberOfLines: 1,
          }}
        >
          {`手动启动：${MANUAL_HOST_COMMAND}`}
        </Text>
      </If>
    </View>
  );
}
