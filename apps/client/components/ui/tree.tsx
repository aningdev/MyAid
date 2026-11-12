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
 * Quiet until hovered, the selected row tinted, a focus ring inside the row
 * while the keyboard is on it, disabled rows dimmed. A press is feedback
 * enough (the row does not fade).
 */
export const treeItemClass =
  "group rounded-md transition-colors duration-150 motion-reduce:transition-none hover:bg-accent " +
  "selected:bg-primary/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:opacity-40";

/**
 * Icon, label, then a disclosure chevron in a trailing lane for folders:
 * leaves take no chevron lane, so icons and labels line up across a level.
 * The chevron shows on hover and stays while the folder is open.
 */
export function TreeRow(props: {
  entry: TreeEntry;
  icon?: IconName;
  tint?: string;
  detail?: string;
  /** Indent level to draw instead of `entry.depth` (e.g. rows under a section header). */
  depth?: number;
}) {
  const desktop = platform.idiom === "desktop";
  const height = desktop ? 28 : 44;
  const depth = props.depth ?? props.entry.depth;
  return (
    <View
      style={{
        height,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingRight: 6,
        paddingLeft: 4 + depth * treeIndent,
      }}
    >
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
      <If when={props.entry.folder}>
        <View
          class="opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-aria-expanded:opacity-100 motion-reduce:transition-none"
          style={{ width: 14, height: 14 }}
        >
          <View
            class="transition-transform duration-200 ease-out group-aria-expanded:rotate-90 motion-reduce:transition-none"
            style={{ width: 14, height: 14 }}
          >
            <Icon name="chevron" size={12} tint={colors.muted} />
          </View>
        </View>
      </If>
    </View>
  );
}
