import { Text, View } from "nsh";

import { colors } from "../components/ui";
import type { IconName } from "../components/ui";
import type { ModuleId, WorkspaceModule } from "./moduleHost";

/** Blank full-bleed module page with a title so chrome/tests have a text node. */
function BlankPage(props: { title: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        desktop={{ windowDrag: true }}
        style={{
          height: 52,
          flexShrink: 0,
          justifyContent: "center",
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>{props.title}</Text>
      </View>
      <View style={{ flex: 1, padding: 24 }}>
        <Text style={{ fontSize: 14, color: colors.muted }}>Coming soon.</Text>
      </View>
    </View>
  );
}

export function placeholderModule(
  id: ModuleId,
  label: string,
  shortLabel: string,
  icon: IconName,
): WorkspaceModule {
  return {
    id,
    label,
    shortLabel,
    icon,
    Page: () => <BlankPage title={label} />,
  };
}
