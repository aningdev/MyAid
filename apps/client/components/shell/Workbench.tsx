import { Text, View } from "nsh";
import { DockArea, type DockAreaRef, type DockPanel } from "nsh/base";

import { alpha, colors, handleThumb } from "../ui";
import { PanelChrome } from "./PanelChrome";
import { SlotPlaceholder } from "./SlotPlaceholder";
import {
  activePanelId,
  dockLayout,
  onPanelActiveChange,
  onPanelRemove,
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
        renderPanel={(panel) => <PanelBody panel={panel} />}
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

/** A Panel's content: the active one keeps a quiet accent ring inside its edges. */
function PanelBody(props: { panel: DockPanel }) {
  const active = () => activePanelId() === props.panel.id;
  return (
    <View
      class="min-h-0 min-w-0 flex-1"
      style={{
        borderWidth: 1,
        borderColor: active() ? alpha(colors.ring, 0.6) : "transparent",
      }}
    >
      <SlotPlaceholder panelId={props.panel.id} />
    </View>
  );
}
