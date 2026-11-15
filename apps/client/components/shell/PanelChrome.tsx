import {
  Maximize2,
  Minimize2,
  PanelBottom,
  PanelRight,
  SlidersHorizontal,
  X,
  type IconNode,
} from "lucide";
import { Text, View, token } from "nsh";
import { type DockAreaRef, type DockTab } from "nsh/base";

import { BotMark } from "../../features/bots/BotMark";
import { openBotDetails } from "../../features/bots/details";
import { registry } from "../../features/bots/state";
import { sessionList } from "../../features/dialogue/session/runtime";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { IconButton, iconButtonGlyph } from "../ui/button";
import { activePanelId, panelBotId, panelTitle, splitPanel } from "./state";

/**
 * A Pane's header: its Bot's mark and name, then the Bot details button and
 * the split / zoom / close controls. Only the focused Pane's controls always
 * show; the others show while the header is hovered or one of them has the
 * keyboard focus (each also has a shortcut, bound in `Shell`). No tabs.
 */
export function PanelChrome(props: { tab: DockTab; area: DockAreaRef | undefined }) {
  const tab = props.tab;
  const bot = () => {
    const id = panelBotId(tab.panel);
    return id ? (registry().bots.find((item) => item.id === id) ?? null) : null;
  };
  const title = () => panelTitle(tab.panel);
  const active = () => activePanelId() === tab.panel;
  /** A running Session of this Bot: the header's mark breathes too. */
  const working = () => {
    const id = bot()?.id;
    return !!id && sessionList().some((row) => row.running && row.botId === id);
  };

  return (
    <View
      testID={`tab-${tab.panel}`}
      class="h-9 flex-row items-center gap-1 px-2"
      style={{ backgroundColor: active() ? token("background") : token("inset") }}
    >
      <If when={bot()}>
        {(current) => <BotMark identity={current().identity} size={16} working={working()} />}
      </If>
      <Text
        class="flex-1 text-[13px] font-medium"
        style={{
          numberOfLines: 1,
          color: active() ? token("foreground") : token("muted-foreground"),
        }}
      >
        {title()}
      </Text>
      <View
        class={
          active()
            ? "flex-row items-center"
            : "flex-row items-center opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
        }
      >
        <If when={bot()}>
          {(current) => (
            <ChromeBtn
              label={t("panel.botDetails", { name: current().name })}
              icon={SlidersHorizontal}
              onPress={() => openBotDetails(current().id)}
            />
          )}
        </If>
        <ChromeBtn
          label={t("panel.splitRight", { title: title() })}
          icon={PanelRight}
          onPress={() => splitPanel(tab.panel, "right")}
        />
        <ChromeBtn
          label={t("panel.splitDown", { title: title() })}
          icon={PanelBottom}
          onPress={() => splitPanel(tab.panel, "down")}
        />
        <ChromeBtn
          label={
            tab.zoomed
              ? t("panel.restore", { title: title() })
              : t("panel.zoom", { title: title() })
          }
          icon={tab.zoomed ? Minimize2 : Maximize2}
          onPress={() => props.area?.toggleZoom(tab.group)}
        />
        <If when={tab.closable}>
          <ChromeBtn
            label={t("panel.close", { title: title() })}
            icon={X}
            onPress={() => props.area?.closePanel(tab.panel)}
          />
        </If>
      </View>
    </View>
  );
}

function ChromeBtn(props: { label: string; icon: IconNode; onPress: () => void }) {
  return (
    <IconButton onPress={props.onPress} accessibilityLabel={props.label}>
      <Icon icon={props.icon} {...iconButtonGlyph()} />
    </IconButton>
  );
}
