/**
 * Settings: a whole-page overlay over the Workbench. ⚙ in the Navigator's
 * footer and ⌘, open it; Back or Escape brings the Panes back exactly as they
 * were (the overlay covers them, it does not replace them). The page's left
 * rail holds model providers, general, background and about; each section
 * owns its reads. The open state lives in `settings.ts`, so a unit test can
 * import the command table without this page's control-channel chain.
 */
import { cleanup, effect, keymap, Text, View } from "nsh";

import { SettingsPage } from "../../features/settings/Page";
import { colors, Icon, Press } from "../ui";
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
      style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.background }}
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
          borderBottomColor: colors.line,
        }}
      >
        <Press
          onPress={closeSettings}
          accessibilityLabel="Back to Panes"
          scale={0.96}
          style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
        >
          <Icon name="back" size={14} tint={colors.muted} />
          <Text style={{ fontSize: 13, color: colors.muted }}>Back</Text>
        </Press>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: colors.text }}>
          Settings
        </Text>
      </View>
      <SettingsPage />
    </View>
  );
}
