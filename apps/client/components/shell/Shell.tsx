/**
 * The Workspace Shell: collapsible left Navigator (the flat Bot list, the
 * Host's state, Settings) beside the Workbench (the Panes that show Bots).
 */
import { effect, keymap, platform, View } from "nsh";
import { Button, ResizablePanel, ResizablePanelGroup } from "nsh/base";
import { isAvailable as hasWindow, Menu, titleBar } from "nsh/desktop";

import { t } from "../../lib/i18n";
import { colors, handleThumb, Icon } from "../ui";
import { startAttention } from "./attention";
import { buildApplicationMenu, COMMANDS, runCommand } from "./commands";
import { startShell } from "./host";
import { HostFooter } from "./HostFooter";
import {
  NAV_MAX_WIDTH,
  NAV_MIN_WIDTH,
  TITLE_CHROME,
  navOpen,
  navWidth,
  setNavWidth,
  toggleNavOpen,
} from "./layout";
import { Navigator } from "./Navigator";
import { ShellNotices } from "./Notices";
import { collectShellPrefs, markPrefsLoaded, prefsLoaded, saveShellPrefs } from "./prefs";
import { closeSettingsOnEscape } from "./SettingsOverlay";
import { Workbench } from "./Workbench";

/** Left navigator (resizable, collapsible) and the workbench on the right. */
export function Shell() {
  // Once, on mount: read the registry, probe the Host, connect dsh when it
  // answers, then apply the prefs (a v4 file waits for its Host instead).
  effect(() => {
    void startShell();
  });
  // One command table feeds the keyboard, the menu and the palette.
  for (const command of COMMANDS) {
    if (command.shortcut) keymap.bind(command.shortcut, () => runCommand(command.id));
  }
  // The menu's enabled states follow the active Pane: rebuilding it in an
  // effect re-reads the signals the commands' `enabled` functions read.
  if (hasWindow) {
    effect(() => {
      Menu.setApplicationMenu(buildApplicationMenu(COMMANDS, { mac: platform.os === "macos" }));
    });
  }
  // Escape closes Settings while it covers the Panes.
  closeSettingsOnEscape();
  // A reply or an approval in a Session the person is not watching may notify.
  startAttention();
  // Preferences: one debounced write after the launch applied the old ones.
  effect(() => {
    if (!prefsLoaded()) return;
    saveShellPrefs(collectShellPrefs());
  });
  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        flexDirection: "column",
        backgroundColor: colors.inset,
      }}
    >
      <If when={!navOpen()}>
        <CollapsedChrome />
      </If>
      <ResizablePanelGroup
        axis="horizontal"
        handleClass="bg-border"
        handleThumbClass={handleThumb}
        handleAccessibilityLabel={t("shell.resizeNavigator")}
        style={{ flex: 1, minHeight: 0, minWidth: 0 }}
      >
        <ResizablePanel
          size={navWidth()}
          minSize={NAV_MIN_WIDTH}
          maxSize={NAV_MAX_WIDTH}
          visible={navOpen()}
          onResize={({ size }) => setNavWidth(size)}
          class="border-border min-h-0 min-w-0 border-r"
        >
          <Sidebar />
        </ResizablePanel>
        <ResizablePanel class="bg-background min-h-0 min-w-0">
          <Workbench />
        </ResizablePanel>
      </ResizablePanelGroup>
    </View>
  );
}

function Sidebar() {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        flexDirection: "column",
        backgroundColor: colors.inset,
      }}
    >
      <SidebarHeader />
      <Navigator />
      <ShellNotices />
      <HostFooter />
    </View>
  );
}

/** Title-bar row. The leading inset is the traffic lights; the rest drags the window. */
function SidebarHeader() {
  return (
    <View
      desktop={{ windowDrag: true }}
      class="shrink-0 flex-row items-center"
      style={{
        height: TITLE_CHROME,
        backgroundColor: colors.inset,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <View style={{ width: titleBar().left }} />
      <View class="pl-2">
        <NavToggle />
      </View>
      <View style={{ flex: 1 }} />
    </View>
  );
}

/** Collapsed window chrome: the drag region and the Expand button. No title. */
function CollapsedChrome() {
  return (
    <View
      desktop={{ windowDrag: true }}
      class="shrink-0 flex-row items-center"
      style={{
        height: TITLE_CHROME,
        backgroundColor: colors.inset,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
      }}
    >
      <View style={{ width: titleBar().left }} />
      <View class="pl-2">
        <NavToggle />
      </View>
      <View style={{ flex: 1 }} />
    </View>
  );
}

/** Collapses or expands the Navigator; the icon stays the same, the name says which. */
function NavToggle() {
  const open = () => navOpen();
  return (
    <Button
      onPress={() => toggleNavOpen()}
      accessibilityLabel={open() ? t("shell.collapseNavigator") : t("shell.expandNavigator")}
      class="hover:bg-accent focus:outline-ring size-7 items-center justify-center rounded-md focus:outline-2 focus:-outline-offset-2"
    >
      <Icon name="sidebar" size={16} tint={colors.muted} />
    </Button>
  );
}
