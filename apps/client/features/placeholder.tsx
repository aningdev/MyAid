import { View } from "nsh";
import { colors } from "../components/ui";
import type { IconName } from "../components/ui";
import type { ModuleId } from "../workspace/state";
import type { WorkspaceModule } from "../workspace/types";

/** Blank full-bleed module page (no forced List/Main layout). */
function BlankPage() {
  return <View style={{ flex: 1, backgroundColor: colors.background }} />;
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
    Page: BlankPage,
  };
}
