/**
 * Workspace shell: primary nav chrome + ModuleHost.
 * Secondary layout is owned by each module's Page.
 */
import { effect, Text, View } from "nsh";
import { isAvailable as hasWindow, titleBar, Window } from "nsh/desktop";

import { isDesktopLayout, TITLE_CHROME, titleTopInset } from "../workspace/layout";
import { modules } from "../workspace/modules";
import { moduleAtRoot, moduleId } from "../workspace/state";
import { NavRail } from "./NavRail";
import { AppTabBar } from "./TabBar";
import { colors } from "./ui";

export { isDesktopLayout } from "../workspace/layout";

/** Apply hidden title bar once the shell mounts (matches nsh desktop example). */
function useHiddenTitleBar() {
  if (!hasWindow) return;
  effect(() => {
    Window.setTitle("MyAid");
    Window.setTitleBar({ style: "hidden", height: TITLE_CHROME });
  });
}

/**
 * Narrow-window title strip (MobileShell when hasWindow; no Rail).
 * Only this strip + NavRail empty band drag the window — never the content tree.
 */
function NarrowWindowChrome() {
  return (
    <If when={hasWindow && titleTopInset() > 0}>
      <View
        desktop={{ windowDrag: true }}
        style={{
          height: titleTopInset(),
          flexShrink: 0,
          paddingLeft: titleBar().left + 12,
          paddingRight: titleBar().right + 12,
          backgroundColor: colors.inset,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }}>MyAid</Text>
      </View>
    </If>
  );
}

/** Mounts the active module's Page (remounts when moduleId changes). */
function ModuleHost() {
  return (
    <Each of={modules.filter((m) => m.id === moduleId())} key={(m) => m.id}>
      {(mod) => {
        const Page = mod().Page;
        return <Page />;
      }}
    </Each>
  );
}

/**
 * Wide desktop: Rail | content fill the window edge-to-edge under hidden title bar.
 * Drag regions: NavRail empty band + per-page headers (`windowDrag`). Never the
 * whole content column — that made every click drag the window.
 * Traffic lights clear via Rail paddingTop; Win/GTK caption via content paddingTop.
 */
function DesktopShell() {
  useHiddenTitleBar();

  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        flexDirection: "row",
        backgroundColor: colors.inset,
      }}
    >
      <NavRail />
      <View
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          backgroundColor: colors.background,
          // Caption buttons sit on the right; macOS lights sit over the Rail only.
          paddingTop: titleBar().right > 0 ? titleTopInset() : 0,
          paddingRight: titleBar().right,
        }}
      >
        <ModuleHost />
      </View>
    </View>
  );
}

function MobileShell() {
  useHiddenTitleBar();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NarrowWindowChrome />
      <View style={{ flex: 1, minHeight: 0 }}>
        <ModuleHost />
      </View>
      <If when={moduleAtRoot()}>
        <AppTabBar />
      </If>
    </View>
  );
}

/** Adaptive shell: Rail/Tab + module page host. */
export function AppShell() {
  return (
    <If when={isDesktopLayout()} else={<MobileShell />}>
      <DesktopShell />
    </If>
  );
}
