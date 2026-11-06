import { Text, View } from "nsh";
import { DockArea, type DockAreaRef } from "nsh/base";

import { colors, handleThumb } from "../ui";
import { PanelChrome } from "./PanelChrome";
import { SlotPlaceholder } from "./SlotPlaceholder";
import {
  dockLayout,
  onPanelActiveChange,
  onPanelRemove,
  panelContents,
  setDockLayout,
} from "./state";

export function Workbench() {
  let area!: DockAreaRef;

  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.background }}>
      <DockArea
        ref={area}
        class="flex-1"
        layout={dockLayout()}
        onLayoutChange={(e) => setDockLayout(e.layout)}
        onPanelRemove={(e) => onPanelRemove(e.panel)}
        onPanelActiveChange={(e) => onPanelActiveChange(e.panel, e.active)}
        groupClass="flex-1 overflow-hidden bg-background"
        tabBarClass="flex-row"
        tabClass="group flex-1"
        contentClass="flex-1"
        handleAccessibilityLabel="Resize panels"
        handleClass="basis-px bg-border"
        handleThumbClass={handleThumb}
        dropIndicatorClass="rounded-lg border-2 border-primary bg-primary/10"
        renderTab={(tab) => <PanelChrome tab={tab} area={area} />}
        renderPanel={(panel) => <SlotPlaceholder address={panelContents()[panel.id] ?? null} />}
        renderEmpty={(_placement) => (
          <View class="flex-1 items-center justify-center gap-1 p-6">
            <Text class="text-sm font-semibold" style={{ color: colors.text }}>
              No panels
            </Text>
            <Text class="text-xs" style={{ color: colors.muted }}>
              Split a panel or pick a Navigator item.
            </Text>
          </View>
        )}
      />
    </View>
  );
}
