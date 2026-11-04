/**
 * Dialogue module page — owns List|Main|Context (desktop) and mobile NavStack.
 * Shell only mounts this Page; it does not own Dialogue layout.
 */
import type { JSX } from "nsh";
import {
  Animated,
  cleanup,
  createAnimatedValue,
  Easing,
  effect,
  Text,
  untracked,
  View,
} from "nsh";
import { NavPage, NavStack } from "nsh/base";
import { colors, header, hovered, Icon, radius } from "../../components/ui";
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
    <View
      onPress={() => {
        if (untracked(isDesktopLayout)) toggleContext();
        else if (open()) closeContextPage();
        else openContextPage();
      }}
      role="button"
      accessibilityLabel="Context"
      accessibilityState={{ selected: open() }}
      hoverStyle={hovered()}
      style={{
        height: 32,
        paddingHorizontal: 10,
        borderRadius: radius.control,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: open() ? colors.raised : "transparent",
        cursor: "pointer",
      }}
    >
      <Icon name="panel-bottom" size={16} tint={open() ? colors.accent : colors.muted} />
      <Text style={{ fontSize: 13, fontWeight: "500", color: open() ? colors.text : colors.muted }}>
        Context
      </Text>
    </View>
  );
}

function DesktopMainHeader() {
  return (
    <View
      style={{
        height: 52,
        flexShrink: 0,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: colors.line,
        backgroundColor: colors.background,
        gap: 8,
      }}
    >
      <Text style={{ flex: 1, fontSize: 17, fontWeight: "600", color: colors.text }}>Dialogue</Text>
      <If when={selectedId()}>
        <ContextToggle />
      </If>
    </View>
  );
}

function ContextPane(props: { children: JSX.Element }) {
  const slide = createAnimatedValue(untracked(contextOpen) ? 0 : CONTEXT_WIDTH);
  let first = true;
  effect(() => {
    const open = contextOpen();
    if (first) {
      first = false;
      slide.set(open ? 0 : CONTEXT_WIDTH);
      return;
    }
    Animated.timing(slide, {
      toValue: open ? 0 : CONTEXT_WIDTH,
      duration: 220,
      easing: Easing.out(Easing.cubic),
    }).start();
  });
  return (
    <View style={{ width: contextOpen() ? CONTEXT_WIDTH : 0, flexShrink: 0, overflow: "hidden" }}>
      <View
        style={{
          width: CONTEXT_WIDTH,
          flex: 1,
          transform: [{ translateX: slide }],
          backgroundColor: colors.inset,
          borderLeftWidth: 1,
          borderLeftColor: colors.line,
        }}
      >
        {props.children}
      </View>
    </View>
  );
}

function DesktopDialogue() {
  return (
    <View style={{ flex: 1, flexDirection: "row", minHeight: 0, backgroundColor: colors.background }}>
      <View
        style={{
          width: LIST_WIDTH,
          flexShrink: 0,
          backgroundColor: colors.background,
          borderRightWidth: 1,
          borderRightColor: colors.line,
        }}
      >
        <DialogueList />
      </View>
      <View style={{ flex: 1, minWidth: 0, backgroundColor: colors.background }}>
        <DesktopMainHeader />
        <View style={{ flex: 1, minHeight: 0 }}>
          <DialogueMain selectedId={selectedId()} />
        </View>
      </View>
      <ContextPane>
        <DialogueContext selectedId={selectedId()} />
      </ContextPane>
    </View>
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
