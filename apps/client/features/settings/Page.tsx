/**
 * Settings, a whole-page overlay over the Panes. The groups are Model
 * providers, General, Background and About; the left rail switches them and
 * the overlay keeps the Panes underneath untouched. Each section owns its own
 * read, so one slow Host call never holds the others blank.
 */
import { Scroll, signal, Text, View } from "nsh";

import { colors, Press, radius, toneTint } from "../../components/ui";
import { AboutSection } from "./About";
import { BackgroundSection } from "./Background";
import { GeneralSection } from "./General";
import { ProvidersSection } from "./ModelProviders";

export type SettingsGroup = "providers" | "general" | "background" | "about";

const GROUPS: readonly { id: SettingsGroup; label: string }[] = [
  { id: "providers", label: "模型供应商" },
  { id: "general", label: "通用" },
  { id: "background", label: "后台" },
  { id: "about", label: "关于" },
];

const group = signal<SettingsGroup>("providers");

/** The group showing; the overlay's Back returns to the Panes, not to this. */
export function settingsGroup(): SettingsGroup {
  return group();
}

export function SettingsPage() {
  return (
    <View style={{ flex: 1, minHeight: 0, minWidth: 0, flexDirection: "row" }}>
      <View
        style={{
          width: 176,
          flexShrink: 0,
          backgroundColor: colors.inset,
          borderRightWidth: 1,
          borderRightColor: colors.line,
        }}
      >
        <Scroll contentStyle={{ padding: 10, gap: 2 }}>
          <Each of={GROUPS}>
            {(entry) => (
              <Press
                testID={`settings-nav-${entry().id}`}
                onPress={() => group.set(entry().id)}
                accessibilityLabel={entry().label}
                accessibilityState={{ selected: group() === entry().id }}
                scale={0.99}
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
                    color: group() === entry().id ? colors.text : colors.muted,
                  }}
                >
                  {entry().label}
                </Text>
              </Press>
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
        <If when={group() === "about"}>
          <AboutSection />
        </If>
      </View>
    </View>
  );
}
