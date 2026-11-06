import { Text, View } from "nsh";

import { colors } from "../ui";
import type { NavAddress } from "./types";

export function SlotPlaceholder(props: { address: NavAddress | null }) {
  const a = props.address;
  if (!a) {
    return (
      <View class="flex-1 items-center justify-center gap-2 p-6">
        <Text class="text-base font-medium" style={{ color: colors.muted }}>
          Empty panel
        </Text>
        <Text class="text-sm" style={{ color: colors.faint, textAlign: "center" }}>
          Select an item in the Navigator, or split this panel.
        </Text>
      </View>
    );
  }
  return (
    <View class="flex-1 gap-3 p-6">
      <Text class="text-xs font-medium uppercase" style={{ color: colors.faint }}>
        Nav address
      </Text>
      <Meta label="Root" value={a.root} />
      <Meta label="Path" value={a.path.join(" › ") || "—"} />
      <Meta label="Title" value={a.title} />
      <Meta label="Kind" value={a.kind} />
      <Meta label="Id" value={a.id} />
    </View>
  );
}

function Meta(props: { label: string; value: string }) {
  return (
    <View class="gap-0.5">
      <Text class="text-xs" style={{ color: colors.faint }}>
        {props.label}
      </Text>
      <Text class="text-sm font-medium" style={{ color: colors.text }}>
        {props.value}
      </Text>
    </View>
  );
}
