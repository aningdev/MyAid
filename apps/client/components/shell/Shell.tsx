/**
 * The Workspace Shell: collapsible left Navigator (the registry's tree, the
 * Host's state) beside the Workbench (Panels that mount the features).
 */
import { effect, keymap, platform, untracked, View } from "nsh";
import { Button, ResizablePanel, ResizablePanelGroup } from "nsh/base";
import { isAvailable as hasWindow, Menu, titleBar } from "nsh/desktop";

import { registry } from "../../features/bots/state";
import { sessionList } from "../../features/dialogue/session/runtime";
import { workspaces } from "../../features/workspace/state";
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
import { collectShellPrefs, prefsLoaded, resolveAddress, saveShellPrefs } from "./prefs";
import { panelContents, setPanelAddress } from "./state";
import { Workbench } from "./Workbench";

/** Left navigator (resizable, collapsible) and the workbench on the right. */
export function Shell() {
  // Once, on mount: read the registry, probe the Host, connect dsh when it answers.
  effect(() => {
    void startShell();
  });
  // One command table feeds the keyboard, the menu and the palette.
  for (const command of COMMANDS) {
    if (command.shortcut) keymap.bind(command.shortcut, () => runCommand(command.id));
  }
  // The menu's enabled states follow the active Panel: rebuilding it in an
  // effect re-reads the signals the commands' `enabled` functions read.
  if (hasWindow) {
    effect(() => {
      Menu.setApplicationMenu(buildApplicationMenu(COMMANDS, { mac: platform.os === "macos" }));
    });
  }
  // A Session's name can arrive from its first prompt (roster), and a Panel
  // opened before that kept the old title: retitle that Panel's tab.
  effect(() => {
    const labels = new Map(sessionList().map((row) => [row.id, row.label]));
    for (const [panelId, address] of Object.entries(untracked(panelContents))) {
      if (!address || address.kind !== "session" || !address.sessionId) continue;
      const label = labels.get(address.sessionId);
      if (!label || label === address.title) continue;
      setPanelAddress(panelId, { ...address, title: label, path: [label] });
    }
  });
  // A Dialogue's name is its Workspace's title: a rename retitles its Panels.
  effect(() => {
    const projection = workspaces();
    const bots = registry();
    for (const [panelId, address] of Object.entries(untracked(panelContents))) {
      if (!address || address.kind !== "dialogue") continue;
      const live = resolveAddress(address, bots, projection);
      if (live && live.title !== address.title) setPanelAddress(panelId, live);
    }
  });
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
        handleAccessibilityLabel="Resize navigator"
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
      accessibilityLabel={open() ? "Collapse navigator" : "Expand navigator"}
      class="hover:bg-accent focus:outline-ring size-7 items-center justify-center rounded-md focus:outline-2 focus:-outline-offset-2"
    >
      <Icon name="sidebar" size={16} tint={colors.muted} />
    </Button>
  );
}
