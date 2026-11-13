import { Text, View } from "nsh";
import { Button, type DockAreaRef, type DockTab } from "nsh/base";

import { BotMark } from "../../features/bots/BotMark";
import { openBotDetails } from "../../features/bots/details";
import { registry } from "../../features/bots/state";
import { sessionList } from "../../features/dialogue/session/runtime";
import { colors, Icon, type IconName } from "../ui";
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
      class="border-border h-9 flex-row items-center gap-1 border-b px-2"
      style={{ backgroundColor: active() ? colors.background : colors.inset }}
    >
      <If when={bot()}>
        {(current) => <BotMark identity={current().identity} size={16} working={working()} />}
      </If>
      <Text
        class="flex-1 text-[13px] font-medium"
        style={{ numberOfLines: 1, color: active() ? colors.text : colors.muted }}
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
              label={`Bot details: ${current().name}`}
              icon="sliders"
              onPress={() => openBotDetails(current().id)}
            />
          )}
        </If>
        <ChromeBtn
          label={`Split ${title()} right`}
          icon="panel-right"
          onPress={() => splitPanel(tab.panel, "right")}
        />
        <ChromeBtn
          label={`Split ${title()} down`}
          icon="panel-bottom"
          onPress={() => splitPanel(tab.panel, "down")}
        />
        <ChromeBtn
          label={tab.zoomed ? `Restore ${title()}` : `Zoom ${title()}`}
          icon={tab.zoomed ? "restore" : "maximize"}
          onPress={() => props.area?.toggleZoom(tab.group)}
        />
        <If when={tab.closable}>
          <ChromeBtn
            label={`Close ${title()}`}
            icon="close"
            onPress={() => props.area?.closePanel(tab.panel)}
          />
        </If>
      </View>
    </View>
  );
}

function ChromeBtn(props: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Button
      onPress={props.onPress}
      accessibilityLabel={props.label}
      class="hover:bg-accent size-7 items-center justify-center rounded-md"
    >
      <Icon name={props.icon} size={13} tint={colors.muted} />
    </Button>
  );
}
