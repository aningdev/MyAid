import { Text, View } from "nsh";
import { titleBar } from "nsh/desktop";

import { railTopInset } from "../workspace/layout";
import { modules } from "../workspace/modules";
import { moduleId, setModule, type ModuleId } from "../workspace/state";
import { colors, hovered, Icon, Press, radius } from "./ui";

/** Base rail width; grows if traffic-light cluster is wider. */
export const RAIL_WIDTH = 80;

/**
 * Desktop primary module rail — full window height under hidden title bar.
 * paddingTop clears traffic lights (never thinner than TITLE_CHROME);
 * empty band + windowDrag move / zoom the window.
 */
export function NavRail() {
  return (
    <View
      desktop={{ windowDrag: true }}
      style={{
        width: Math.max(RAIL_WIDTH, titleBar().left),
        flexShrink: 0,
        backgroundColor: colors.inset,
        borderRightWidth: 1,
        borderRightColor: colors.line,
        paddingTop: railTopInset(),
        paddingBottom: 12,
        alignItems: "center",
        gap: 4,
      }}
    >
      <Each of={modules}>
        {(mod) => {
          const active = () => moduleId() === mod().id;
          return (
            <Press
              onPress={() => setModule(mod().id as ModuleId)}
              accessibilityLabel={mod().label}
              accessibilityState={{ selected: active() }}
              scale={0.94}
            >
              <View
                hoverStyle={active() ? undefined : hovered()}
                style={{
                  width: 56,
                  height: 48,
                  borderRadius: radius.control,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 2,
                  backgroundColor: active() ? colors.raised : "transparent",
                  cursor: "pointer",
                }}
              >
                <Icon name={mod().icon} size={20} tint={active() ? colors.accent : colors.muted} />
                <Text style={{ fontSize: 9, color: active() ? colors.text : colors.faint }}>
                  {mod().shortLabel}
                </Text>
              </View>
            </Press>
          );
        }}
      </Each>
    </View>
  );
}
