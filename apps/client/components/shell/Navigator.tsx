/**
 * Navigator tree body (nsh/base Tree).
 * The sidebar header and collapse control live in Shell.
 */
import { signal, View } from "nsh";
import { Tree } from "nsh/base";

import { colors, TreeRow, treeItemClass, type IconName } from "../ui";
import { NAV_DEFAULT_EXPANDED, NAV_TREE_ITEMS, navKindForId } from "./fixtures";
import { activateNavItem } from "./state";

const SECTION_ICON: Record<string, IconName> = {
  favorites: "star",
  mail: "lists",
  task: "check",
  knowledge: "scroll",
  bots: "spark",
  dialogues: "chat",
  spaces: "sidebar",
  settings: "sliders",
};

function navIcon(id: string): IconName {
  if (id.startsWith("root:")) return SECTION_ICON[id.slice("root:".length)] ?? "lists";
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
        renderItem={(entry) => (
          <TreeRow entry={entry} icon={navIcon(entry.id)} tint={colors.muted} />
        )}
      />
    </View>
  );
}
