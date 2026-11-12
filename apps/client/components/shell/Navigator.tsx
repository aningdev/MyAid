/**
 * Navigator tree body (nsh/base Tree).
 * Depth-0 items are Navigator Sections, drawn as Rex-style headers; their
 * contents are drawn one level shallower so each section's tree starts flush.
 * The sidebar header and collapse control live in Shell.
 */
import { platform, signal, Text, View } from "nsh";
import { Tree, type TreeEntry } from "nsh/base";

import { colors, Icon, TreeRow, treeItemClass, type IconName } from "../ui";
import { NAV_DEFAULT_EXPANDED, NAV_TREE_ITEMS, navKindForId } from "./fixtures";
import { activateNavItem } from "./state";

function navIcon(id: string): IconName {
  switch (navKindForId(id)) {
    case "favorite":
      return "star";
    case "bot":
      return "spark";
    case "dialogue":
      return "chat";
    case "session":
      return "code";
    case "setting":
      return "sliders";
    case "space":
      return "sidebar";
    default:
      return "lists";
  }
}

const expandedState = signal<string[]>([...NAV_DEFAULT_EXPANDED]);
const selectedState = signal<string | null>(null);

export function Navigator() {
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.inset }}>
      <Tree
        class="flex-1"
        items={NAV_TREE_ITEMS}
        expanded={expandedState()}
        selected={selectedState()}
        onExpandedChange={({ expanded }) => expandedState.set(expanded)}
        onSelectedChange={({ selected }) => selectedState.set(selected)}
        onAction={({ id }) => activateNavItem(id)}
        accessibilityLabel="Navigator"
        listClass="p-1.5"
        itemClass={treeItemClass}
        renderItem={(entry) =>
          entry.depth === 0 ? (
            <SectionHeader entry={entry} />
          ) : (
            <TreeRow
              entry={entry}
              depth={entry.depth - 1}
              icon={navIcon(entry.id)}
              tint={colors.muted}
            />
          )
        }
      />
    </View>
  );
}

/**
 * Navigator Section header: small muted label with space above, no icon.
 * Chevron and the action slots show on hover only; the slots are placeholders
 * (no behavior yet). A press toggles the section (Tree's folder press).
 */
function SectionHeader(props: { entry: TreeEntry }) {
  const desktop = platform.idiom === "desktop";
  const first = props.entry.id === NAV_TREE_ITEMS[0]?.id;
  return (
    <View
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
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
      >
        <Icon name="plus" size={12} tint={colors.muted} />
        <Text style={{ fontSize: 12, color: colors.muted }}>⋯</Text>
      </View>
    </View>
  );
}
