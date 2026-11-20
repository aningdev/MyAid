/**
 * Settings, a whole-page overlay over the Panes. The groups are Model
 * providers, General, Background, Devices (the Runner's Client only) and
 * About. The rail switches them and the overlay keeps the Panes underneath
 * untouched. Each section owns its own read, so one slow Host call never
 * holds the others blank. A narrow window stacks the rail on top.
 */
import { platform, Scroll, signal, Text, View, token } from "nsh";

import { Pressable } from "../../components/ui/pressable";
import { t, type MessageKey } from "../../lib/i18n";
import { narrowWindow } from "../../lib/surface";
import { radius, toneTint } from "../../lib/theme";
import { DevicesSection } from "../devices/DevicesSection";
import { AboutSection } from "./About";
import { BackgroundSection } from "./Background";
import { GeneralSection } from "./General";
import { ProvidersSection } from "./ModelProviders";

export type SettingsGroup = "providers" | "general" | "background" | "devices" | "about";

const GROUPS: readonly { id: SettingsGroup; label: MessageKey }[] = [
  { id: "providers", label: "settings.nav.providers" },
  { id: "general", label: "settings.nav.general" },
  { id: "background", label: "settings.nav.background" },
  { id: "devices", label: "settings.nav.devices" },
  { id: "about", label: "settings.nav.about" },
];

/**
 * Devices only where a Host runs beside this Client. Same rule as `hasHost`
 * (`components/shell/host.ts`), read when this page is built.
 */
function visibleGroups(): readonly { id: SettingsGroup; label: MessageKey }[] {
  const runner = platform.idiom === "desktop" && platform.os !== "web";
  return runner ? GROUPS : GROUPS.filter((entry) => entry.id !== "devices");
}

const group = signal<SettingsGroup>("providers");

/** The group showing; the overlay's Back returns to the Panes, not to this. */
export function settingsGroup(): SettingsGroup {
  return group();
}

export function SettingsPage() {
  const stacked = narrowWindow;
  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        flexDirection: stacked() ? "column" : "row",
      }}
    >
      <View
        style={{
          width: stacked() ? undefined : 176,
          flexShrink: 0,
          alignSelf: stacked() ? "stretch" : undefined,
          backgroundColor: token("inset"),
          borderRightWidth: stacked() ? 0 : 1,
          borderBottomWidth: stacked() ? 1 : 0,
          borderRightColor: token("line"),
          borderBottomColor: token("line"),
        }}
      >
        <Scroll
          style={stacked() ? { maxHeight: 132 } : { flex: 1 }}
          contentStyle={
            stacked()
              ? { flexDirection: "row", flexWrap: "wrap", padding: 8, gap: 4 }
              : { padding: 10, gap: 2 }
          }
        >
          <Each of={visibleGroups()}>
            {(entry) => (
              <Pressable
                testID={`settings-nav-${entry().id}`}
                onPress={() => group.set(entry().id)}
                accessibilityLabel={t(entry().label)}
                selected={group() === entry().id}
                style={{
                  minHeight: 38,
                  justifyContent: "center",
                  paddingHorizontal: 10,
                  borderRadius: radius.control,
                  backgroundColor: group() === entry().id ? toneTint("accent") : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: group() === entry().id ? "600" : "400",
                    color: group() === entry().id ? token("foreground") : token("muted-foreground"),
                  }}
                >
                  {t(entry().label)}
                </Text>
              </Pressable>
            )}
          </Each>
        </Scroll>
      </View>
      <View style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <If when={group() === "providers"}>
          <ProvidersSection />
        </If>
        <If when={group() === "general"}>
          <GeneralSection />
        </If>
        <If when={group() === "background"}>
          <BackgroundSection />
        </If>
        <If when={group() === "devices"}>
          <DevicesSection />
        </If>
        <If when={group() === "about"}>
          <AboutSection />
        </If>
      </View>
    </View>
  );
}
