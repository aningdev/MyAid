/**
 * The sidebar's last row: whether this Client reaches the Host, and the way
 * to try again. It is a fact row, not a command bar: one line, one action.
 */
import { signal, Text, View } from "nsh";

import { hostConnection } from "../../features/dialogue/session/runtime";
import { Button, colors } from "../ui";
import { hasHost, retryHost } from "./host";

export function HostFooter() {
  const up = () => hostConnection() === "up";
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

  return (
    <View
      style={{
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.inset,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: up() ? colors.up : colors.faint,
        }}
      />
      <Text
        style={{
          flex: 1,
          fontSize: 11,
          color: colors.muted,
          numberOfLines: 1,
        }}
      >
        {up() ? "Host connected" : "Host disconnected"}
      </Text>
      <If when={!up()}>
        <Button
          label="Retry"
          size="small"
          disabled={!hasHost || busy()}
          onPress={() => void retry()}
        />
      </If>
    </View>
  );
}
