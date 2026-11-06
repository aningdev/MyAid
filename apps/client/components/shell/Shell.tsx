import { View } from "nsh";
import { ResizablePanel, ResizablePanelGroup } from "nsh/base";

import { colors, handleThumb } from "../ui";
import { Navigator } from "./Navigator";
import { Workbench } from "./Workbench";

const NAV_WIDTH = 260;

/** Empty shell: Navigator | Workbench. No features. */
export function Shell() {
  return (
    <ResizablePanelGroup
      axis="horizontal"
      handleClass="bg-line"
      handleThumbClass={handleThumb}
      handleAccessibilityLabel="Resize navigator"
      style={{ flex: 1, minHeight: 0, backgroundColor: colors.inset }}
    >
      <ResizablePanel
        size={NAV_WIDTH}
        minSize={180}
        maxSize={420}
        class="border-border min-h-0 border-r"
      >
        <Navigator />
      </ResizablePanel>
      <ResizablePanel class="bg-background min-h-0 min-w-0">
        <Workbench />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
