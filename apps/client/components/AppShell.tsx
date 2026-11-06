/**
 * Empty Workspace Shell host. Does not mount features/*.
 */
import { effect, Text, View } from "nsh";
import { isAvailable as hasWindow, titleBar, Window } from "nsh/desktop";

import { isDesktopLayout, Shell, TITLE_CHROME, titleTopInset } from "./shell";
import { colors } from "./ui";

export { isDesktopLayout } from "./shell";

function useHiddenTitleBar() {
  if (!hasWindow) return;
  effect(() => {
    Window.setTitle("MyAid");
    Window.setTitleBar({ style: "hidden", height: TITLE_CHROME });
  });
}

function DesktopShell() {
  useHiddenTitleBar();
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: colors.inset }}>
      <Shell />
    </View>
  );
}

function MobileShell() {
  useHiddenTitleBar();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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
      <View class="flex-1 items-center justify-center gap-2 p-8">
        <Text class="text-base font-semibold" style={{ color: colors.text }}>
          Workspace Shell
        </Text>
        <Text class="text-sm" style={{ color: colors.muted, textAlign: "center" }}>
          Desktop empty shell only. Widen the window for the side Navigator and Workbench.
        </Text>
      </View>
    </View>
  );
}

export function AppShell() {
  return (
    <If when={isDesktopLayout()} else={<MobileShell />}>
      <DesktopShell />
    </If>
  );
}
