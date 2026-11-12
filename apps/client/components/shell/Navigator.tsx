/**
 * Navigator tree body (nsh/base Tree) under its filter field.
 * Depth-0 items are Navigator Sections, drawn as Rex-style headers; their
 * contents are drawn one level shallower so each section's tree starts flush.
 * The tree itself is `navData`'s projection of the registry, the roster and
 * the pinned addresses: this file only draws it and owns the search text.
 */
import { effect, keymap, platform, signal, Text, type InputRef, untracked, View } from "nsh";
import { Button, Input, Tree, type TreeEntry, type TreeRef } from "nsh/base";

import { BotMark } from "../../features/bots/BotMark";
import { openNewBot } from "../../features/bots/newBot";
import { colors, Icon, treeItemClass, TreeRow } from "../ui";
import { expandedSections, setExpandedSections } from "./layout";
import {
  navActionForId,
  navBotForId,
  navItemIdForAddress,
  navItems,
  navKindForId,
  navStatusForId,
} from "./navData";
import {
  clearNavQuery,
  navQuery,
  navSearchFocusRequest,
  setNavQuery,
  takeNavSearchFocus,
} from "./navFilter";
import { navKindIcon } from "./navIcons";
import { NavContextMenu } from "./navMenu";
import { activeAddress, activateNavItem } from "./state";
import type { TreeItem } from "./types";

const selectedState = signal<string | null>(null);

export function Navigator() {
  let tree: TreeRef | undefined;
  let search: InputRef | undefined;
  /** The row the user last opened: one address can stand at two rows. */
  let openedItem: string | null = null;

  // The Navigator follows the Workbench: the active Panel's address selects
  // its item here (null when the Panel is empty). The row the user pressed
  // keeps the selection while it stands for that address, so a Dialogue
  // opened from the Dialogues section is not moved to the Bots section.
  // Setting the selection programmatically does not report it back.
  effect(() => {
    const address = activeAddress();
    const pressed = openedItem;
    const action = pressed ? navActionForId(pressed) : undefined;
    const stands = action?.type === "address" && !!address && action.address.id === address.id;
    selectedState.set(
      stands && pressed ? pressed : address ? navItemIdForAddress(address.id) : null,
    );
  });

  // ⌘F / View › Search Navigator: the field takes the keyboard, and the
  // Navigator opens if it was folded away.
  effect(() => {
    if (navSearchFocusRequest() === 0) return;
    takeNavSearchFocus();
    search?.focus();
  });

  // Mod+1…8 reveals (and opens) the Nth Navigator Section, then puts the
  // keyboard on the tree there.
  const revealSection = (index: number) => {
    const section = navItems()[index];
    if (!section) return;
    setExpandedSections([...expandedSections(), section.id]);
    selectedState.set(section.id);
    tree?.revealItem(section.id);
    tree?.focus();
  };
  navItems().forEach((_section, index) => {
    keymap.bind(`mod+${index + 1}`, () => revealSection(index));
  });

  /** Opens the New Bot sheet with the Bots section open, so the way back shows. */
  const newBot = () => {
    setExpandedSections([...expandedSections(), "root:bots"]);
    openNewBot();
  };

  /** A search shows every match's ancestors open; folded sections are restored after. */
  const expanded = () => {
    const query = navQuery().trim();
    if (!query) return [...expandedSections()];
    return parentIds(navItems());
  };

  const empty = () => {
    if (!navQuery().trim()) return false;
    const items = navItems();
    const count = (id: string) => items.find((item) => item.id === id)?.children?.length ?? 0;
    return count("root:bots") === 0 && count("root:dialogues") === 0;
  };

  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.inset }}>
      <View style={{ paddingHorizontal: 6, paddingTop: 6, paddingBottom: 2, gap: 4 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            height: 30,
            paddingHorizontal: 8,
            borderRadius: 8,
            backgroundColor: colors.raised,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Icon name="search" size={13} tint={colors.muted} />
          <Input
            ref={(node) => (search = node ?? undefined)}
            testID="nav-search"
            accessibilityLabel="Filter Bots, Dialogues and Sessions"
            value={navQuery()}
            placeholder="Filter…"
            autoCapitalize="none"
            autoCorrect={false}
            onChange={(event) => setNavQuery(event.value)}
            style={{
              flex: 1,
              height: 28,
              fontSize: 13,
              color: colors.text,
              paddingHorizontal: 0,
              placeholderColor: colors.faint,
            }}
          />
          <If when={!!navQuery()}>
            <Button
              onPress={clearNavQuery}
              accessibilityLabel="Clear filter"
              class="hover:bg-accent size-5 items-center justify-center rounded"
            >
              <Icon name="close" size={11} tint={colors.muted} />
            </Button>
          </If>
        </View>
        <If when={empty()}>
          <Text
            style={{ paddingHorizontal: 4, paddingVertical: 6, fontSize: 12, color: colors.muted }}
          >
            No matches.
          </Text>
        </If>
      </View>
      <Tree
        ref={(r) => (tree = r)}
        class="flex-1"
        items={navItems()}
        expanded={expanded()}
        selected={selectedState()}
        onExpandedChange={({ expanded: next }) => {
          if (!navQuery().trim()) setExpandedSections(next);
        }}
        onSelectedChange={({ selected }) => {
          selectedState.set(selected);
          openedItem = selected;
          // A single press opens a leaf's Nav address (folders that hold an
          // address — a Bot, a Dialogue — open too and still toggle). The
          // New Bot leaf opens its sheet the same way. Spaces apply from
          // Return or a double press: a space replaces the whole Workbench,
          // so passing over it with the arrows must not.
          const action = navActionForId(selected);
          if (action && action.type !== "space") activateNavItem(selected);
        }}
        onAction={({ id }) => activateNavItem(id)}
        accessibilityLabel="Navigator"
        listClass="p-1.5"
        itemClass={treeItemClass}
        renderItem={(entry) =>
          entry.depth === 0 ? (
            <SectionHeader entry={entry} onNewBot={newBot} />
          ) : (
            <NavContextMenu id={entry.id}>
              <NavRow entry={entry} />
            </NavContextMenu>
          )
        }
      />
    </View>
  );
}

/** One object row: a Bot's identity mark, else the kind's icon, and its status. */
function NavRow(props: { entry: TreeEntry }) {
  const bot = () => navBotForId(props.entry.id);
  const status = () => navStatusForId(props.entry.id);
  const kind = () => navKindForId(props.entry.id);

  return (
    <TreeRow
      entry={props.entry}
      depth={props.entry.depth - 1}
      icon={navKindIcon(kind())}
      tint={colors.muted}
      status={status()}
      mark={
        bot() ? (
          <BotMark identity={bot()!.identity} size={18} working={status()?.working === true} />
        ) : undefined
      }
    />
  );
}

/** Every id of a node that has children, so a search shows its matches in context. */
function parentIds(items: readonly TreeItem[]): string[] {
  const ids: string[] = [];
  const walk = (list: readonly TreeItem[]) => {
    for (const item of list) {
      if (item.children && item.children.length > 0) {
        ids.push(item.id);
        walk(item.children);
      }
    }
  };
  walk(items);
  return ids;
}

/**
 * Navigator Section header: small muted label with space above, no icon.
 * Chevron and the action slots show on hover only. Bots carries the one
 * action the shell can take today (a new Bot); the other sections' slots are
 * still placeholders. A press toggles the section (Tree's folder press) and
 * selects its row; the header paints over the selected tint, since a section
 * is a place in the tree, not a destination (its row still takes the
 * keyboard's ring and stays a stop of the arrow keys).
 */
function SectionHeader(props: { entry: TreeEntry; onNewBot: () => void }) {
  const desktop = platform.idiom === "desktop";
  const first = untracked(() => navItems()[0]?.id) === props.entry.id;
  const isBots = props.entry.id === "root:bots";
  return (
    <View
      class="group-selected:bg-muted"
      style={{
        height: (desktop ? 28 : 44) + (first ? 0 : 8),
        paddingTop: first ? 0 : 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingLeft: 6,
        paddingRight: 6,
      }}
    >
      <Text
        class="text-muted-foreground"
        style={{ fontSize: desktop ? 11 : 13, fontWeight: "600", numberOfLines: 1 }}
      >
        {props.entry.label}
      </Text>
      <View
        class="opacity-0 transition-transform duration-200 ease-out group-hover:opacity-100 group-aria-expanded:rotate-90 motion-reduce:transition-none"
        style={{ width: 12, height: 12 }}
      >
        <Icon name="chevron" size={12} tint={colors.muted} />
      </View>
      <View style={{ flex: 1 }} />
      <View
        class="opacity-0 group-hover:opacity-100"
        style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <If when={isBots} else={<Icon name="plus" size={12} tint={colors.muted} />}>
          <Button
            onPress={props.onNewBot}
            accessibilityLabel="New Bot"
            class="hover:bg-accent size-5 items-center justify-center rounded"
          >
            <Icon name="plus" size={12} tint={colors.muted} />
          </Button>
        </If>
        <Text style={{ fontSize: 12, color: colors.muted }}>⋯</Text>
      </View>
    </View>
  );
}
