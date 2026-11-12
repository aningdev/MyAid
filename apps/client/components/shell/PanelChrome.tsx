import { Text, View } from "nsh";
import { Button, type DockAreaRef, type DockTab } from "nsh/base";

import { colors, Icon, type IconName } from "../ui";
import { navKindIcon } from "./navIcons";
import { activePanelId, panelContents, panelTitle, splitPanel } from "./state";

/**
 * A Panel's tab: the address's icon and title, then its commands. Only the
 * active Panel's commands always show; the others show while the tab is
 * hovered or one of them has the keyboard focus (each also has a shortcut,
 * bound in `Shell`).
 */
export function PanelChrome(props: { tab: DockTab; area: DockAreaRef | undefined }) {
  const tab = props.tab;
  const address = () => panelContents()[tab.panel];
  const title = () => panelTitle(tab.panel);
  const active = () => activePanelId() === tab.panel;

  return (
    <View
      testID={`tab-${tab.panel}`}
      class="border-border h-9 flex-row items-center gap-1 border-b px-2"
      style={{ backgroundColor: active() ? colors.background : colors.inset }}
    >
      <If when={address()}>
        {(a) => (
          <Icon
            name={navKindIcon(a().kind)}
            size={13}
            tint={active() ? colors.muted : colors.faint}
          />
        )}
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
