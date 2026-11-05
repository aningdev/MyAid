import { platform, safeArea, Text, View } from "nsh";
import { TabBar, isAvailable as isMobile } from "nsh/mobile";

import { openModule } from "../features/dialogue/navigate";
import { modules } from "../workspace/modules";
import { moduleId } from "../workspace/state";
import { colors, Icon, Press, type IconName } from "./ui";

const iosTabIcons: Partial<Record<IconName, string>> = {
  spark: "sparkles",
  chat: "message",
  check: "checklist",
  "arrow-up": "arrow.up.circle",
  components: "cpu",
  storage: "books.vertical",
  sliders: "slider.horizontal.3",
  system: "gearshape",
};

const androidTabIcons: Partial<Record<IconName, string>> = {
  spark: "android:ic_menu_today",
  chat: "android:ic_dialog_email",
  check: "android:ic_menu_agenda",
  "arrow-up": "android:ic_menu_upload",
  components: "android:ic_menu_manage",
  storage: "android:ic_menu_info_details",
  sliders: "android:ic_menu_preferences",
  system: "android:ic_menu_preferences",
};

/** Map product icons to platform tab icons (SF Symbols / Android drawables). */
const tabIcon = (name: IconName): string =>
  platform.select({
    ios: iosTabIcons[name] ?? "circle",
    android: androidTabIcons[name] ?? "android:ic_menu_more",
    default: "circle",
  }) ?? "circle";

function selectedIndex() {
  const i = modules.findIndex((m) => m.id === moduleId());
  return i < 0 ? 0 : i;
}

function SystemTabBar() {
  return (
    <TabBar
      items={modules.map((m) => ({
        title: m.shortLabel,
        icon: tabIcon(m.icon),
      }))}
      selectedIndex={selectedIndex()}
      onChange={(e) => {
        const mod = modules[e.index];
        if (mod) openModule(mod.id);
      }}
      style={{ flexShrink: 0 }}
    />
  );
}

/** Custom bar for desktop/web where nsh/mobile TabBar takes no room. */
function DrawnTabBar() {
  return (
    <View
      style={{
        flexShrink: 0,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        backgroundColor: colors.inset,
        paddingBottom: safeArea().bottom,
      }}
    >
      <View class="min-h-12 flex-row">
        <Each of={modules} key={(mod) => mod.id}>
          {(mod) => {
            const active = () => moduleId() === mod().id;
            return (
              <Press
                onPress={() => openModule(mod().id)}
                accessibilityLabel={mod().label}
                accessibilityState={{ selected: active() }}
                style={{ flex: 1 }}
              >
                <View class="min-h-11 flex-1 items-center justify-center gap-0.5">
                  <Icon
                    name={mod().icon}
                    size={18}
                    tint={active() ? colors.accent : colors.muted}
                  />
                  <Text class="text-xs" style={{ color: active() ? colors.text : colors.faint }}>
                    {mod().shortLabel}
                  </Text>
                </View>
              </Press>
            );
          }}
        </Each>
      </View>
    </View>
  );
}

/**
 * Primary mobile tabs: system TabBar on iOS/Android;
 * drawn fallback on narrow desktop / web (system bar height is 0 there).
 */
export function AppTabBar() {
  return (
    <If when={isMobile} else={<DrawnTabBar />}>
      <SystemTabBar />
    </If>
  );
}
