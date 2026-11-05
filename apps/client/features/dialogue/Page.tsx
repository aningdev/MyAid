/**
 * Dialogue module page — owns List|Main|Context (desktop) and mobile NavStack.
 * Shell only mounts this Page; it does not own Dialogue layout.
 */
import { cleanup, effect, Text, untracked, View } from "nsh";
import { NavPage, NavStack, ResizablePanel, ResizablePanelGroup } from "nsh/base";

import { colors, handleThumb, header, hovered, Icon, Press, radius } from "../../components/ui";
import { WorkspacePageHeader } from "../../components/workspace/PageHeader";
import { isDesktopLayout } from "../../workspace/layout";
import { setModuleAtRoot } from "../../workspace/state";
import { DialogueContext } from "./Context";
import { DialogueList } from "./List";
import { DialogueMain } from "./Main";
import {
  closeContextPage,
  dialogueNav,
  onContextDismiss,
  openContextPage,
  popDialogue,
  resetDialogueStack,
  type DialogueRoute,
} from "./nav";
import { contextOpen, selectedId, toggleContext } from "./state";

const LIST_WIDTH = 300;
const CONTEXT_WIDTH = 320;

function ContextToggle() {
  const open = () => contextOpen();
  return (
    <Press
      onPress={() => {
        if (untracked(isDesktopLayout)) toggleContext();
        else if (open()) closeContextPage();
        else openContextPage();
      }}
      accessibilityLabel="Context"
      accessibilityState={{ selected: open() }}
      hoverStyle={hovered()}
      class="px-2"
      style={{ borderRadius: radius.control }}
    >
      <View
        class="flex-row items-center gap-1.5"
        style={{ backgroundColor: open() ? colors.raised : "transparent" }}
      >
        <Icon name="panel-bottom" size={16} tint={open() ? colors.accent : colors.muted} />
        <Text class="text-sm font-medium" style={{ color: open() ? colors.text : colors.muted }}>
          Context
        </Text>
      </View>
    </Press>
  );
}

function DesktopMainHeader() {
  return (
    <View
      class="min-h-12 shrink-0 flex-row items-center gap-2 px-4"
      desktop={{ windowDrag: true }}
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.background,
      }}
    >
      <Text class="text-lg font-semibold" style={{ flex: 1, color: colors.text }}>
        Dialogue
      </Text>
      <If when={selectedId()}>
        <ContextToggle />
      </If>
    </View>
  );
}

function DesktopDialogue() {
  return (
    <ResizablePanelGroup
      axis="horizontal"
      handleClass="bg-border"
      handleThumbClass={handleThumb}
      handleAccessibilityLabel="Resize panes"
      style={{ flex: 1, minHeight: 0, backgroundColor: colors.background }}
    >
      <ResizablePanel
        size={LIST_WIDTH}
        minSize={220}
        maxSize={420}
        class="border-border bg-background border-r"
      >
        <DialogueList />
      </ResizablePanel>
      <ResizablePanel class="bg-background min-w-0">
        <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.background }}>
          <DesktopMainHeader />
          <View style={{ flex: 1, minHeight: 0 }}>
            <DialogueMain selectedId={selectedId()} />
          </View>
        </View>
      </ResizablePanel>
      <ResizablePanel
        size={CONTEXT_WIDTH}
        minSize={240}
        maxSize={480}
        visible={contextOpen()}
        class="border-border bg-muted border-l"
      >
        <DialogueContext selectedId={selectedId()} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function MobileDialogue() {
  return (
    <NavStack state={dialogueNav} style={{ flex: 1 }}>
      {(route: DialogueRoute) => {
        switch (route.name) {
          case "list":
            return (
              <NavPage
                title="Dialogue"
                headerStyle={header.headerStyle}
                header={<WorkspacePageHeader title="Dialogue" root />}
              >
                <DialogueList />
              </NavPage>
            );
          case "main":
            return (
              <NavPage
                title="Dialogue"
                headerStyle={header.headerStyle}
                onDismiss={() => setModuleAtRoot(true)}
                header={
                  <WorkspacePageHeader
                    title="Dialogue"
                    onBack={() => popDialogue()}
                    trailing={<ContextToggle />}
                  />
                }
              >
                <DialogueMain selectedId={route.selectedId} />
              </NavPage>
            );
          case "context":
            return (
              <NavPage
                title="Context"
                headerStyle={header.headerStyle}
                onDismiss={onContextDismiss}
                header={<WorkspacePageHeader title="Context" onBack={() => closeContextPage()} />}
              >
                <DialogueContext selectedId={route.selectedId} />
              </NavPage>
            );
        }
      }}
    </NavStack>
  );
}

/** Dialogue primary page mounted by the shell ModuleHost. */
export function DialoguePage() {
  // Keep TabBar in sync with the stack (back button, swipe, and pop APIs).
  effect(() => {
    const top = dialogueNav.routes().at(-1);
    setModuleAtRoot(!top || top.name === "list");
  });
  cleanup(() => {
    resetDialogueStack();
  });

  return (
    <If when={isDesktopLayout()} else={<MobileDialogue />}>
      <DesktopDialogue />
    </If>
  );
}
