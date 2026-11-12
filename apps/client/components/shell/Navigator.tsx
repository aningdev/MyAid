/**
 * Navigator tree body (nsh/base Tree).
 * Depth-0 items are Navigator Sections, drawn as Rex-style headers; their
 * contents are drawn one level shallower so each section's tree starts flush.
 * The tree itself is `navData`'s projection of the registry and the parked
 * sections: this file only draws it. The sidebar header and collapse control
 * live in Shell.
 */
import { effect, keymap, platform, signal, Text, untracked, View } from "nsh";
import { Button, Tree, type TreeEntry, type TreeRef } from "nsh/base";

import { colors, Icon, TreeRow, treeItemClass } from "../ui";
import { NAV_DEFAULT_EXPANDED } from "./fixtures";
import { navActionForId, navItemIdForAddress, navItems, navKindForId, navStatusForId } from "./navData";
import { navKindIcon } from "./navIcons";
import { activateNavItem, activeAddress, openNewBotDraft } from "./state";

const expandedState = signal<string[]>([...NAV_DEFAULT_EXPANDED]);
const selectedState = signal<string | null>(null);

export function Navigator() {
  let tree: TreeRef | undefined;
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

  // Mod+1…8 reveals (and opens) the Nth Navigator Section, then puts the
  // keyboard on the tree there.
  const revealSection = (index: number) => {
    const section = navItems()[index];
    if (!section) return;
    expandedState.set([...new Set([...untracked(expandedState), section.id])]);
    selectedState.set(section.id);
    tree?.revealItem(section.id);
    tree?.focus();
  };
  navItems().forEach((_section, index) => {
    keymap.bind(`mod+${index + 1}`, () => revealSection(index));
  });

  /** Opens the new-Bot draft with the Bots section open, so the row shows. */
  const newBot = () => {
    expandedState.set([...new Set([...untracked(expandedState), "root:bots"])]);
    openNewBotDraft();
  };
  keymap.bind("mod+n", newBot);

  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.inset }}>
      <Tree
        ref={(r) => (tree = r)}
        class="flex-1"
        items={navItems()}
        expanded={expandedState()}
        selected={selectedState()}
        onExpandedChange={({ expanded }) => expandedState.set(expanded)}
        onSelectedChange={({ selected }) => {
          selectedState.set(selected);
          openedItem = selected;
          // A single press opens a leaf's Nav address (folders that hold an
          // address — a Bot, a Dialogue — open too and still toggle). Spaces
          // apply from Return or a double press: a space replaces the whole
          // Workbench, so passing over it with the arrows must not.
          if (navActionForId(selected)?.type === "address") activateNavItem(selected);
        }}
        onAction={({ id }) => activateNavItem(id)}
        accessibilityLabel="Navigator"
        listClass="p-1.5"
        itemClass={treeItemClass}
        renderItem={(entry) =>
          entry.depth === 0 ? (
            <SectionHeader entry={entry} onNewBot={newBot} />
          ) : (
            <TreeRow
              entry={entry}
              depth={entry.depth - 1}
              icon={navKindIcon(navKindForId(entry.id))}
              tint={colors.muted}
              status={navStatusForId(entry.id)}
            />
          )
        }
      />
    </View>
  );
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
