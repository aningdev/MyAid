import { keymap, Text, View } from "nsh";

import { BotMark } from "../../features/bots/BotMark";
import { nextIdentity } from "../../features/bots/identity";
import { openNewBot } from "../../features/bots/newBot";
import { legacyRegistry, loadError, ready, registry } from "../../features/bots/state";
import { Button, colors, Icon } from "../ui";
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
  const firstLaunch = () =>
    ready() && !loadError() && !legacyRegistry() && registry().bots.length === 0;
  return (
    <If
      when={ready() && !!loadError()}
      else={
        <If when={firstLaunch()} else={<EmptyPanel />}>
          <Welcome />
        </If>
      }
    >
      <View class="flex-1 items-center justify-center gap-2 p-6">
        <Icon name="diagnostics" size={24} tint={colors.danger} />
        <Text class="text-sm font-medium" style={{ color: colors.text }}>
          The registry could not be read
        </Text>
        <Text class="text-xs" style={{ color: colors.muted, textAlign: "center" }}>
          {loadError()}
        </Text>
      </View>
    </If>
  );
}

function EmptyPanel() {
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

/** No Bots yet: the one thing to do first, with the mark it will wear. */
function Welcome() {
  return (
    <View class="flex-1 items-center justify-center p-6">
      <View style={{ alignItems: "center", gap: 14, maxWidth: 420 }}>
        <BotMark identity={nextIdentity(0)} size={56} />
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={{ fontSize: 20, fontWeight: "600", color: colors.text }}>
            Welcome to MyAid
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: colors.muted,
              textAlign: "center",
            }}
          >
            Bots are who you work with. Give one a name, a mark and a workspace; every conversation
            with it lives in its Dialogues.
          </Text>
        </View>
        <Button label="Create your first Bot" variant="accent" onPress={openNewBot} />
        <Text style={{ fontSize: 11, color: colors.faint }}>
          {`${keymap.label("mod+shift+n")} opens this any time`}
        </Text>
      </View>
    </View>
  );
}
