/**
 * Empty shell: collapsible left Navigator beside the Workbench.
 */
import { keymap, Text, View } from "nsh";
import { Button, ResizablePanel, ResizablePanelGroup } from "nsh/base";
import { titleBar } from "nsh/desktop";

import { colors, handleThumb } from "../ui";
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
import { Workbench } from "./Workbench";

/** Left navigator (resizable, collapsible) and the workbench on the right. */
export function Shell() {
  keymap.bind("mod+b", toggleNavOpen);
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
    </View>
  );
}

/** Title-bar row. The leading spacer is the traffic-light inset; the rest drags the window. */
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
      <View style={{ flex: 1 }} />
      <View class="pr-3">
        <NavToggle />
      </View>
    </View>
  );
}

/** Collapsed window chrome: drag region and Expand. No title. */
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
      <View class="pl-3">
        <NavToggle />
      </View>
    </View>
  );
}

function NavToggle() {
  const open = () => navOpen();
  return (
    <Button
      onPress={() => toggleNavOpen()}
      accessibilityLabel={open() ? "Collapse navigator" : "Expand navigator"}
      class="hover:bg-accent focus:outline-ring h-7 rounded-md px-2.5 focus:outline-2 focus:-outline-offset-2 active:opacity-70"
    >
      <Text class="text-muted-foreground text-xs font-medium">
        {open() ? "Collapse" : "Expand"}
      </Text>
    </Button>
  );
}
