/**
 * The empty Pane, and the two states that take its place: a registry that
 * could not be read, and a first launch with no Bots. The Bots' Panes mount
 * `features/bots`; nothing here reads a domain.
 */
import { PanelsTopLeft, TriangleAlert } from "lucide";
import { keymap, Text, View, token } from "nsh";

import { BotMark } from "../../features/bots/BotMark";
import { nextIdentity } from "../../features/bots/identity";
import { openNewBot } from "../../features/bots/newBot";
import { legacyRegistry, loadError, ready, registry } from "../../features/bots/state";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { Button } from "../ui/button";

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
        <Icon icon={TriangleAlert} size={24} tint={token("destructive")} />
        <Text class="text-sm font-medium" style={{ color: token("foreground") }}>
          {t("empty.registryTitle")}
        </Text>
        <Text class="text-xs" style={{ color: token("muted-foreground"), textAlign: "center" }}>
          {loadError()}
        </Text>
      </View>
    </If>
  );
}

function EmptyPanel() {
  return (
    <View class="flex-1 items-center justify-center gap-2 p-6">
      <Icon icon={PanelsTopLeft} size={24} tint={token("faint")} />
      <Text class="text-sm font-medium" style={{ color: token("muted-foreground") }}>
        {t("empty.panelTitle")}
      </Text>
      <Text class="text-xs" style={{ color: token("faint"), textAlign: "center" }}>
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
          <Text style={{ fontSize: 20, fontWeight: "600", color: token("foreground") }}>
            {t("welcome.title")}
          </Text>
          <Text
            style={{
              fontSize: 13,
              lineHeight: 19,
              color: token("muted-foreground"),
              textAlign: "center",
            }}
          >
            {t("welcome.body")}
          </Text>
        </View>
        <Button onPress={openNewBot} accessibilityLabel={t("welcome.create")}>
          {t("welcome.create")}
        </Button>
        <Text style={{ fontSize: 11, color: token("faint") }}>
          {t("welcome.shortcut", { shortcut: keymap.label("mod+n") ?? "" })}
        </Text>
      </View>
    </View>
  );
}
