/**
 * Settings: a whole-page overlay over the Workbench. ⚙ in the Navigator's
 * footer and ⌘, open it; Back or Escape brings the Panes back exactly as they
 * were (the overlay covers them, it does not replace them). The page's left
 * rail holds model providers, general, background and about; each section
 * owns its reads. The open state lives in `settings.ts`, so a unit test can
 * import the command table without this page's control-channel chain.
 */
import { ChevronLeft } from "lucide";
import { cleanup, effect, keymap, Text, View, token } from "nsh";

import { SettingsPage } from "../../features/settings/Page";
import { t } from "../../lib/i18n";
import { Icon } from "../../lib/icons";
import { Pressable } from "../ui/pressable";
import { closeSettings, settingsOpen } from "./settings";

/** Escape closes the overlay while it is the top thing on screen. */
export function closeSettingsOnEscape(): void {
  effect(() => {
    if (!settingsOpen()) return;
    const off = keymap.bind("escape", closeSettings, { when: "always" });
    cleanup(off);
  });
}

export function SettingsOverlay() {
  return (
    <View
      testID="settings-overlay"
      style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: token("background") }}
    >
      <View
        style={{
          height: 44,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 10,
          borderBottomWidth: 1,
          borderBottomColor: token("line"),
        }}
      >
        <Pressable
          onPress={closeSettings}
          accessibilityLabel={t("settings.backLabel")}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Icon icon={ChevronLeft} size={14} tint={token("muted-foreground")} />
          <Text style={{ fontSize: 13, color: token("muted-foreground") }}>
            {t("settings.back")}
          </Text>
        </Pressable>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: token("foreground") }}>
          {t("settings.title")}
        </Text>
      </View>
      <SettingsPage />
    </View>
  );
}
