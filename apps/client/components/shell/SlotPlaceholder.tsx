/**
 * The empty Pane, and the two states that take its place: a registry that
 * could not be read, and a first launch with no Bots. The Bots' Panes mount
 * `features/bots`; nothing here reads a domain.
 */
import { PanelsTopLeft, TriangleAlert } from "lucide";
import { Text, View, token } from "nsh";

import { Shortcut } from "../../components/app";
import { BotMark } from "../../features/bots/BotMark";
import { nextIdentity } from "../../features/bots/identity";
import { openNewBot } from "../../features/bots/newBot";
import { legacyRegistry, loadError, ready, registry } from "../../features/bots/state";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { Button } from "../ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EMPTY_ICON,
} from "../ui/empty";

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
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon={TriangleAlert} size={EMPTY_ICON} tint={token("destructive")} />
          </EmptyMedia>
          <EmptyTitle>{t("empty.registryTitle")}</EmptyTitle>
          <EmptyDescription>{loadError()}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </If>
  );
}

function EmptyPanel() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon icon={PanelsTopLeft} size={EMPTY_ICON} tint={token("faint")} />
        </EmptyMedia>
        <EmptyTitle>{t("empty.panelTitle")}</EmptyTitle>
        <EmptyDescription>{t("empty.panelNote")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
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
        <Button onPress={openNewBot}>{t("welcome.create")}</Button>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          <Shortcut keystroke="mod+n" />
          <Text style={{ fontSize: 11, color: token("faint") }}>{t("welcome.shortcut")}</Text>
        </View>
      </View>
    </View>
  );
}
