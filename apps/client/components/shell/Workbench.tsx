import { Text, View } from "nsh";
import { DockArea, type DockAreaRef, type DockPanel } from "nsh/base";

import { t } from "../../lib/i18n";
import { alpha, colors, handleThumb } from "../ui";
import { PanelChrome } from "./PanelChrome";
import { PanelView } from "./PanelView";
import { settingsOpen } from "./settings";
import { SettingsOverlay } from "./SettingsOverlay";
import {
  activePanelId,
  dockLayout,
  onPanelActiveChange,
  onPanelRemove,
  setDockLayout,
} from "./state";

/**
 * The Panes, and the settings overlay drawn over them: the overlay covers the
 * area rather than replacing it, so the Panes keep their layout, their scroll
 * and their drafts while it is open.
 */
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
        handleAccessibilityLabel={t("shell.resizePanels")}
        handleClass="basis-px bg-border"
        handleThumbClass={handleThumb}
        dropIndicatorClass="rounded-lg border-2 border-primary bg-primary/10"
        renderTab={(tab) => <PanelChrome tab={tab} area={area} />}
        renderPanel={(panel) => <PanelBody panel={panel} />}
        renderEmpty={(_placement) => (
          <View class="flex-1 items-center justify-center gap-1 p-6">
            <Text class="text-sm font-semibold" style={{ color: colors.text }}>
              {t("panel.noPanels")}
            </Text>
            <Text class="text-xs" style={{ color: colors.muted }}>
              {t("panel.noPanelsNote")}
            </Text>
          </View>
        )}
      />
      <If when={settingsOpen()}>
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.background,
          }}
        >
          <SettingsOverlay />
        </View>
      </If>
    </View>
  );
}

/** A Pane's content: the focused one keeps a quiet accent ring inside its edges. */
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
      <PanelView panelId={props.panel.id} />
    </View>
  );
}
