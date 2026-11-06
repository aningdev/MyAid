import { Text, View } from "nsh";
import { Button, type DockAreaRef, type DockTab } from "nsh/base";

import { colors, Icon } from "../ui";
import { panelTitle, splitPanel } from "./state";

export function PanelChrome(props: { tab: DockTab; area: DockAreaRef | undefined }) {
  const tab = props.tab;
  const title = panelTitle(tab.panel);

  return (
    <View
      testID={`tab-${tab.panel}`}
      class="border-line h-9 flex-row items-center gap-1 border-b px-2"
      style={{ backgroundColor: tab.active ? colors.raised : colors.inset }}
    >
      <Text
        class="flex-1 text-[13px] font-medium"
        style={{ numberOfLines: 1, color: tab.active ? colors.text : colors.muted }}
      >
        {title}
      </Text>
      <ChromeBtn
        label={`Split ${title} right`}
        icon="sidebar"
        onPress={() => splitPanel(tab.panel, "right")}
      />
      <ChromeBtn
        label={`Split ${title} down`}
        icon="panel-bottom"
        onPress={() => splitPanel(tab.panel, "down")}
      />
      <ChromeBtn
        label={tab.zoomed ? `Restore ${title}` : `Zoom ${title}`}
        icon="spark"
        onPress={() => props.area?.toggleZoom(tab.group)}
      />
      <If when={tab.closable}>
        <ChromeBtn
          label={`Close ${title}`}
          icon="close"
          onPress={() => props.area?.closePanel(tab.panel)}
        />
      </If>
    </View>
  );
}

function ChromeBtn(props: {
  label: string;
  icon: "sidebar" | "panel-bottom" | "spark" | "close";
  onPress: () => void;
}) {
  return (
    <Button
      onPress={props.onPress}
      accessibilityLabel={props.label}
      class="hover:bg-hover size-7 items-center justify-center rounded-md active:opacity-70"
    >
      <Icon name={props.icon} size={13} tint={colors.muted} />
    </Button>
  );
}
