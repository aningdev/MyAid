/**
 * Navigator Tree — styling follows nsh docs / gallery Tree pattern
 * (https://nsh.dev/elements/tree.md): itemClass + renderItem chevron/label only.
 */
import { signal, Text, View } from "nsh";
import { Tree } from "nsh/base";

import { colors } from "../ui";
import { NAV_DEFAULT_EXPANDED, NAV_TREE_ITEMS } from "./fixtures";
import { activateNavItem } from "./state";

const expandedState = signal<string[]>([...NAV_DEFAULT_EXPANDED]);
const selectedState = signal<string | null>(null);

export function Navigator() {
  return (
    <View style={{ flex: 1, minWidth: 0, minHeight: 0, backgroundColor: colors.inset }}>
      <View
        class="min-h-10 shrink-0 justify-center px-3"
        desktop={{ windowDrag: true }}
        style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}
      >
        <Text class="text-sm font-semibold" style={{ color: colors.text }}>
          Navigator
        </Text>
      </View>
      <Tree
        class="flex-1"
        items={NAV_TREE_ITEMS}
        expanded={expandedState()}
        selected={selectedState()}
        onExpandedChange={({ expanded }) => expandedState.set(expanded)}
        onSelectedChange={({ selected }) => selectedState.set(selected)}
        onAction={({ id }) => activateNavItem(id)}
        accessibilityLabel="Navigator"
        listClass="p-1"
        itemClass="group h-8 rounded-md hover:bg-accent selected:bg-primary/10 focus:outline-2 focus:-outline-offset-2 focus:outline-ring disabled:opacity-50"
        renderItem={(entry) => (
          <View
            class="h-8 flex-row items-center gap-2"
            style={{ paddingLeft: 8 + entry.depth * 16 }}
          >
            <Text class="text-muted-foreground w-3 transition-transform group-aria-expanded:rotate-90">
              {entry.folder ? "›" : ""}
            </Text>
            <Text class="text-foreground text-sm">{entry.label}</Text>
          </View>
        )}
      />
    </View>
  );
}
