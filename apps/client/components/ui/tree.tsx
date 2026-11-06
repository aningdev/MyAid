/**
 * Tree rows in the gallery Settings style (`nsh-gallery-ui/tree.tsx`).
 * States live on the row class (`group` in `treeItemClass`); the row itself
 * is drawn once. Hover / selected use this app's tokens (`accent`, `primary`),
 * not gallery-only `hover` / `brand-tint`.
 */
import { platform, Text, View } from "nsh";
import type { TreeEntry } from "nsh/base";

import { Icon, type IconName } from "./icons";
import { colors } from "./theme";

/** How far each level is indented, in points. */
export const treeIndent = 14;

/**
 * Quiet until hovered, the selected row tinted, a focus ring inside the row,
 * disabled rows dimmed.
 */
export const treeItemClass =
  "group rounded-md transition-colors duration-150 motion-reduce:transition-none hover:bg-accent active:opacity-70 " +
  "selected:bg-primary/10 focus:outline-2 focus:-outline-offset-2 focus:outline-ring disabled:opacity-40";

/**
 * Chevron (folders), optional icon, label. A leaf keeps an invisible chevron
 * so icons line up. Selected label uses the strong text color, not a weight.
 */
export function TreeRow(props: {
  entry: TreeEntry;
  icon?: IconName;
  tint?: string;
  detail?: string;
}) {
  const desktop = platform.idiom === "desktop";
  const height = desktop ? 28 : 44;
  return (
    <View
      style={{
        height,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingRight: 8,
        paddingLeft: 4 + props.entry.depth * treeIndent,
      }}
    >
      <View
        class="transition-transform duration-200 ease-out group-aria-expanded:rotate-90 motion-reduce:transition-none"
        style={{ width: 14, height: 14, opacity: props.entry.folder ? 1 : 0 }}
      >
        <Icon name="chevron" size={14} tint={colors.muted} />
      </View>
      {props.icon ? <Icon name={props.icon} size={16} tint={props.tint ?? colors.muted} /> : null}
      <Text
        class="text-muted-foreground group-selected:text-foreground flex-1"
        style={{ fontSize: desktop ? 13 : 15, numberOfLines: 1 }}
      >
        {props.entry.label}
      </Text>
      {props.detail ? (
        <Text style={{ fontSize: 12, color: colors.faint }}>{props.detail}</Text>
      ) : null}
    </View>
  );
}
