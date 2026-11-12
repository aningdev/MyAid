import { Text, View } from "nsh";

import { colors, Icon } from "../ui";
import { rootLabel } from "./fixtures";
import { navKindIcon } from "./navIcons";
import { panelContents } from "./state";
import type { NavAddress } from "./types";

/**
 * A Panel's body for now: what address it holds (its icon, title and
 * breadcrumb) and that its content is to come, or the empty slot's short
 * prompt. Nothing here reads the domain: panels mount no `features/*` yet.
 */
export function SlotPlaceholder(props: { panelId: string }) {
  const address = () => panelContents()[props.panelId] ?? null;
  return (
    <If when={address()} else={<EmptySlot />}>
      {(a) => <AddressSlot address={a()} />}
    </If>
  );
}

function AddressSlot(props: { address: NavAddress }) {
  const path = () => [rootLabel(props.address.root), ...props.address.path];

  return (
    <View class="flex-1 items-center justify-center gap-2 p-6">
      <Icon name={navKindIcon(props.address.kind)} size={24} tint={colors.faint} />
      <Text class="text-sm font-medium" style={{ color: colors.text, textAlign: "center" }}>
        {props.address.title}
      </Text>
      <Text class="text-xs" style={{ color: colors.faint, textAlign: "center", numberOfLines: 1 }}>
        {path().join(" › ")}
      </Text>
      <Text class="text-xs" style={{ color: colors.faint }}>
        Content coming soon
      </Text>
    </View>
  );
}

function EmptySlot() {
  return (
    <View class="flex-1 items-center justify-center gap-2 p-6">
      <Icon name="nav" size={24} tint={colors.faint} />
      <Text class="text-sm font-medium" style={{ color: colors.muted }}>
        Empty panel
      </Text>
      <Text class="text-xs" style={{ color: colors.faint, textAlign: "center" }}>
        Pick a Navigator item or split this panel.
      </Text>
    </View>
  );
}
