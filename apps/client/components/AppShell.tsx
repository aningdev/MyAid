/**
 * Workspace Shell host: the desktop opens the Navigator and the Panes, whose
 * bodies mount the Bot feature. Narrow windows are a placeholder for now.
 */
import { effect, Text, View, token } from "nsh";
import { isAvailable as hasWindow, titleBar, Window } from "nsh/desktop";

import { BotDetails } from "../features/bots/BotDetails";
import { NewBotSheet } from "../features/bots/NewBotSheet";
import { t } from "../lib/i18n";
import { isDesktopLayout, Shell, TITLE_CHROME, titleTopInset } from "./shell";
import { CommandPalette } from "./shell/CommandPalette";
import { NavigatorSheets } from "./shell/NavigatorSheets";

export { isDesktopLayout } from "./shell";

function useHiddenTitleBar() {
  if (!hasWindow) return;
  effect(() => {
    Window.get("main")?.set({
      title: "MyAid",
      titleBar: { style: "hidden", height: TITLE_CHROME },
    });
  });
}

function DesktopShell() {
  useHiddenTitleBar();
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: token("inset") }}>
      <Shell />
      {/* One modal for every Bot details entry point (a Pane's header, the list). */}
      <BotDetails />
      {/* The one New Bot sheet, the palette, and the Navigator's forms. */}
      <NewBotSheet />
      <CommandPalette />
      <NavigatorSheets />
    </View>
  );
}

function MobileShell() {
  useHiddenTitleBar();
  return (
    <View style={{ flex: 1, backgroundColor: token("background") }}>
      <If when={hasWindow && titleTopInset() > 0}>
        <View
          desktop={{ windowDrag: true }}
          style={{
            height: titleTopInset(),
            flexShrink: 0,
            paddingLeft: titleBar().left + 12,
            paddingRight: titleBar().right + 12,
            backgroundColor: token("inset"),
            borderBottomWidth: 1,
            borderBottomColor: token("line"),
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: token("foreground") }}>MyAid</Text>
        </View>
      </If>
      <View class="flex-1 items-center justify-center gap-2 p-8">
        <Text class="text-base font-semibold" style={{ color: token("foreground") }}>
          {t("app.mobileTitle")}
        </Text>
        <Text class="text-sm" style={{ color: token("muted-foreground"), textAlign: "center" }}>
          {t("app.mobileNote")}
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
