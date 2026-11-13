/**
 * The empty Pane, and the two states that take its place: a registry that
 * could not be read, and a first launch with no Bots. The Bots' Panes mount
 * `features/bots`; nothing here reads a domain.
 */
import { keymap, Text, View } from "nsh";

import { BotMark } from "../../features/bots/BotMark";
import { nextIdentity } from "../../features/bots/identity";
import { openNewBot } from "../../features/bots/newBot";
import { legacyRegistry, loadError, ready, registry } from "../../features/bots/state";
import { t } from "../../lib/i18n";
import { Button, colors, Icon } from "../ui";

export function SlotPlaceholder() {
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
          {t("empty.registryTitle")}
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
        {t("empty.panelTitle")}
      </Text>
      <Text class="text-xs" style={{ color: colors.faint, textAlign: "center" }}>
        {t("empty.panelNote")}
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
            {t("welcome.title")}
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: colors.muted,
              textAlign: "center",
            }}
          >
            {t("welcome.body")}
          </Text>
        </View>
        <Button label={t("welcome.create")} variant="accent" onPress={openNewBot} />
        <Text style={{ fontSize: 11, color: colors.faint }}>
          {t("welcome.shortcut", { shortcut: keymap.label("mod+n") ?? "" })}
        </Text>
      </View>
    </View>
  );
}
